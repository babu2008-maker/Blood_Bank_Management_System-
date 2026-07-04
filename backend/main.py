import os
import datetime
import random
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db, engine, Base
from backend import models, schemas, auth
from backend.auth import get_password_hash

# Auto-create database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Blood Donate API",
    description="Backend API for managing donors, blood inventory, requests, and reports.",
    version="1.0"
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to audit log actions
def log_audit(db: Session, user_id: Optional[int], action: str, details: str):
    audit_log = models.AuditLog(user_id=user_id, action=action, details=details)
    db.add(audit_log)
    db.commit()

# Helper function to update expired stock dynamically
def check_and_update_expired_stock(db: Session):
    now = datetime.datetime.utcnow()
    expired_units = db.query(models.BloodStock).filter(
        models.BloodStock.status == "Available",
        models.BloodStock.expiry_date < now
    ).all()
    if expired_units:
        for unit in expired_units:
            unit.status = "Expired"
            if unit.donation:
                unit.donation.status = "Expired"
        db.commit()
        # System-generated log
        log_audit(db, None, "SYSTEM_EXPIRE_STOCK", f"Automatically marked {len(expired_units)} blood units as Expired.")


# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/api/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = auth.create_access_token(data={"sub": user.username, "role": user.role})
    log_audit(db, user.id, "LOGIN", f"User {user.username} logged in successfully.")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "full_name": user.full_name
    }


@app.post('/api/auth/register')
def register_public_user(reg: schemas.PublicRegister, db: Session = Depends(get_db)):
    # Simple public registration that creates a `donor` role
    existing = db.query(models.User).filter(
        (models.User.username == reg.username) | (models.User.email == reg.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail='Username or email already exists')

    password_hash = auth.get_password_hash(reg.password)
    user = models.User(
        username=reg.username,
        password_hash=password_hash,
        role='donor',
        email=reg.email,
        full_name=reg.full_name
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Audit log
    try:
        log_audit(db, user.id, 'REGISTER_PUBLIC', f'User {user.username} registered as donor')
    except Exception:
        pass

    return { 'message': 'Account created. Please log in.' }

@app.get("/api/auth/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


# ==========================================
# DONOR ENDPOINTS
# ==========================================

@app.post("/api/donors", response_model=schemas.DonorResponse)
def create_donor(
    donor: schemas.DonorCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.donor_protected)
):
    # Check if donor email already exists
    existing = db.query(models.Donor).filter(models.Donor.email == donor.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Donor with this email already registered"
        )
        
    db_donor = models.Donor(**donor.model_dump())
    db.add(db_donor)
    db.commit()
    db.refresh(db_donor)
    
    log_audit(db, current_user.id, "REGISTER_DONOR", f"Registered new donor: {db_donor.name} ({db_donor.blood_group})")
    return db_donor

@app.get("/api/donors", response_model=List[schemas.DonorResponse])
def get_donors(
    query: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.donor_protected)
):
    db_query = db.query(models.Donor)
    if query:
        search = f"%{query}%"
        db_query = db_query.filter(
            (models.Donor.name.like(search)) |
            (models.Donor.blood_group.like(search)) |
            (models.Donor.contact_number.like(search)) |
            (models.Donor.email.like(search))
        )
    return db_query.order_by(models.Donor.name).all()

@app.get("/api/donors/{donor_id}", response_model=schemas.DonorResponse)
def get_donor(
    donor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.donor_protected)
):
    donor = db.query(models.Donor).filter(models.Donor.id == donor_id).first()
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
    return donor

@app.put("/api/donors/{donor_id}", response_model=schemas.DonorResponse)
def update_donor(
    donor_id: int,
    donor_update: schemas.DonorUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.donor_protected)
):
    db_donor = db.query(models.Donor).filter(models.Donor.id == donor_id).first()
    if not db_donor:
        raise HTTPException(status_code=404, detail="Donor not found")
        
    update_data = donor_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_donor, key, value)
        
    db.commit()
    db.refresh(db_donor)
    log_audit(db, current_user.id, "UPDATE_DONOR", f"Updated details for donor ID {donor_id}: {db_donor.name}")
    return db_donor

@app.post("/api/donors/{donor_id}/donations", response_model=schemas.DonationResponse)
def record_donation(
    donor_id: int,
    quantity_ml: int = 350,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.donor_protected)
):
    donor = db.query(models.Donor).filter(models.Donor.id == donor_id).first()
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
        
    # Check eligibility
    if not donor.eligibility_status:
        raise HTTPException(
            status_code=400,
            detail=f"Donor is currently ineligible. Reason: {donor.eligibility_notes}"
        )
        
    # Check date of last donation (minimum 90 days interval)
    if donor.last_donation_date:
        days_since = (datetime.datetime.utcnow() - donor.last_donation_date).days
        if days_since < 90:
            raise HTTPException(
                status_code=400,
                detail=f"Donor donated recently. Only {days_since} days have elapsed (min 90 days required)."
            )
            
    # Generate unique barcode
    barcode = f"BAR-{donor.blood_group.replace('+', 'POS').replace('-', 'NEG')}-{random.randint(100000, 999999)}"
    
    # Record Donation
    donation = models.Donation(
        donor_id=donor.id,
        quantity_ml=quantity_ml,
        blood_group=donor.blood_group,
        blood_unit_barcode=barcode,
        status="Available"
    )
    db.add(donation)
    db.flush()
    
    # Create corresponding stock item
    now = datetime.datetime.utcnow()
    expiry = now + datetime.timedelta(days=42) # standard RBC storage life is 42 days
    
    stock_item = models.BloodStock(
        donation_id=donation.id,
        blood_group=donor.blood_group,
        quantity_ml=quantity_ml,
        unit_barcode=barcode,
        collection_date=now,
        expiry_date=expiry,
        status="Available"
    )
    db.add(stock_item)
    
    # Update donor's last donation date
    donor.last_donation_date = now
    
    db.commit()
    db.refresh(donation)
    
    log_audit(
        db, 
        current_user.id, 
        "RECORD_DONATION", 
        f"Recorded {quantity_ml}ml donation from {donor.name} ({donor.blood_group}). Barcode: {barcode}"
    )
    
    return donation

@app.get("/api/donors/{donor_id}/history", response_model=List[schemas.DonationResponse])
def get_donor_donation_history(
    donor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.donor_protected)
):
    donor = db.query(models.Donor).filter(models.Donor.id == donor_id).first()
    if not donor:
        raise HTTPException(status_code=404, detail="Donor not found")
        
    return db.query(models.Donation).filter(models.Donation.donor_id == donor_id).order_by(models.Donation.collection_date.desc()).all()


# ==========================================
# INVENTORY ENDPOINTS
# ==========================================

@app.get("/api/inventory", response_model=List[schemas.BloodStockResponse])
def get_inventory(
    blood_group: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.any_authenticated)
):
    check_and_update_expired_stock(db)
    
    query = db.query(models.BloodStock).filter(models.BloodStock.status != "Issued")
    if blood_group:
        query = query.filter(models.BloodStock.blood_group == blood_group)
        
    # Add temporary field is_expired for validation
    stock_items = query.order_by(models.BloodStock.expiry_date).all()
    now = datetime.datetime.utcnow()
    for item in stock_items:
        item.is_expired = item.expiry_date < now

    # Audit log: record that an inventory view occurred for inventory-only users
    try:
        if current_user and getattr(current_user, 'role', None) == 'inventory':
            log_audit(db, current_user.id, "VIEW_INVENTORY", f"Inventory viewed by {current_user.username} (read-only)")
    except Exception:
        # audit logging must not break read operations
        pass

    return stock_items

@app.get("/api/inventory/alerts")
def get_inventory_alerts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.staff_or_inventory)
):
    check_and_update_expired_stock(db)
    now = datetime.datetime.utcnow()
    near_expiry_limit = now + datetime.timedelta(days=7)
    
    expired = db.query(models.BloodStock).filter(models.BloodStock.status == "Expired").all()
    near_expiry = db.query(models.BloodStock).filter(
        models.BloodStock.status == "Available",
        models.BloodStock.expiry_date >= now,
        models.BloodStock.expiry_date <= near_expiry_limit
    ).all()
    
    # Low stock alerts (less than 2 units for any blood group)
    low_stock = []
    for bg in ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]:
        count = db.query(models.BloodStock).filter(
            models.BloodStock.blood_group == bg,
            models.BloodStock.status == "Available"
        ).count()
        if count < 2:
            low_stock.append({"blood_group": bg, "units_available": count})
    
    # Audit: inventory alerts viewed by inventory-only users
    try:
        if current_user and getattr(current_user, 'role', None) == 'inventory':
            log_audit(db, current_user.id, "VIEW_INVENTORY_ALERTS", f"Inventory alerts viewed by {current_user.username} (read-only)")
    except Exception:
        pass

    return {
        "expired": expired,
        "near_expiry": near_expiry,
        "low_stock_groups": low_stock
    }

@app.post("/api/inventory/add", response_model=schemas.BloodStockResponse)
def add_blood_unit(
    stock_in: schemas.BloodStockBase,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.admin_or_staff)
):
    # Verify barcode uniqueness
    existing = db.query(models.BloodStock).filter(models.BloodStock.unit_barcode == stock_in.unit_barcode).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Blood unit barcode already exists in system inventory"
        )
        
    now = datetime.datetime.utcnow()
    stock_item = models.BloodStock(
        blood_group=stock_in.blood_group,
        quantity_ml=stock_in.quantity_ml,
        unit_barcode=stock_in.unit_barcode,
        collection_date=now,
        expiry_date=stock_in.expiry_date,
        status="Available"
    )
    db.add(stock_item)
    db.commit()
    db.refresh(stock_item)
    
    log_audit(
        db, 
        current_user.id, 
        "ADD_STOCK", 
        f"Manually added blood unit: {stock_item.blood_group}, Barcode: {stock_item.unit_barcode}"
    )
    return stock_item


# ==========================================
# REQUESTS ENDPOINTS
# ==========================================

@app.post("/api/requests", response_model=schemas.BloodRequestResponse)
def create_request(
    request: schemas.BloodRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.any_authenticated)
):
    # If the user is a hospital role, restrict requesting_hospital name to their registered hospital
    req_hospital = request.requesting_hospital
    if current_user.role == "hospital" and current_user.hospital_name:
        req_hospital = current_user.hospital_name
        
    db_request = models.BloodRequest(
        patient_name=request.patient_name,
        requesting_hospital=req_hospital,
        blood_group=request.blood_group,
        quantity_units=request.quantity_units,
        urgency=request.urgency,
        status="Pending"
    )
    
    db.add(db_request)
    db.commit()
    db.refresh(db_request)
    
    log_audit(
        db, 
        current_user.id, 
        "CREATE_REQUEST", 
        f"Submitted blood request for Patient: {db_request.patient_name}, Group: {db_request.blood_group}, Qty: {db_request.quantity_units} unit(s)"
    )
    return db_request


@app.post("/api/public/requests", response_model=schemas.BloodRequestResponse)
def create_public_request(
    request: schemas.BloodRequestCreate,
    db: Session = Depends(get_db)
):
    # Accept requests from public donors without authentication
    db_request = models.BloodRequest(
        patient_name=request.patient_name,
        requesting_hospital=request.requesting_hospital,
        blood_group=request.blood_group,
        quantity_units=request.quantity_units,
        urgency=request.urgency,
        status="Pending"
    )
    db.add(db_request)
    db.commit()
    db.refresh(db_request)

    # Log as system/public action
    try:
        log_audit(db, None, "CREATE_PUBLIC_REQUEST", f"Public request submitted for {db_request.patient_name}, Group: {db_request.blood_group}, Qty: {db_request.quantity_units}")
    except Exception:
        pass

    return db_request

@app.get("/api/requests", response_model=List[schemas.BloodRequestResponse])
def get_requests(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.any_authenticated)
):
    query = db.query(models.BloodRequest)
    
    # Hospital role can only see their own requests
    if current_user.role == "hospital" and current_user.hospital_name:
        query = query.filter(models.BloodRequest.requesting_hospital == current_user.hospital_name)
        
    if status_filter:
        query = query.filter(models.BloodRequest.status == status_filter)
        
    return query.order_by(models.BloodRequest.request_date.desc()).all()

@app.put("/api/requests/{request_id}/status", response_model=schemas.BloodRequestResponse)
def update_request_status(
    request_id: int,
    update: schemas.BloodRequestUpdateStatus,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.admin_or_staff)
):
    req = db.query(models.BloodRequest).filter(models.BloodRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if req.status == "Fulfilled":
        raise HTTPException(status_code=400, detail="Cannot alter status of a completed/fulfilled request")
        
    new_status = update.status
    
    # Handle fulfillment operations
    if new_status == "Fulfilled":
        check_and_update_expired_stock(db)
        
        # Check stock availability
        available_units = db.query(models.BloodStock).filter(
            models.BloodStock.blood_group == req.blood_group,
            models.BloodStock.status == "Available"
        ).order_by(models.BloodStock.expiry_date.asc()).all() # FIFO - First to expire, first out
        
        if len(available_units) < req.quantity_units:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient inventory of {req.blood_group}. Requested: {req.quantity_units}, Available: {len(available_units)} unit(s)."
            )
            
        # Deduct / Issue the units
        issued_barcodes = []
        for i in range(req.quantity_units):
            unit = available_units[i]
            unit.status = "Issued"
            if unit.donation:
                unit.donation.status = "Issued"
            issued_barcodes.append(unit.unit_barcode)
            
        req.status_notes = f"Dispatched units: {', '.join(issued_barcodes)}. {update.status_notes or ''}"
    else:
        req.status_notes = update.status_notes
        
    req.status = new_status
    req.fulfiller_id = current_user.id
    
    db.commit()
    db.refresh(req)
    
    log_audit(
        db, 
        current_user.id, 
        "FULFILL_REQUEST", 
        f"Request ID {request_id} for {req.patient_name} marked as {new_status}."
    )
    return req


# ==========================================
# DASHBOARD & REPORTS ENDPOINTS
# ==========================================

@app.get("/api/dashboard/summary", response_model=schemas.DashboardSummary)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.any_authenticated)
):
    check_and_update_expired_stock(db)
    now = datetime.datetime.utcnow()
    seven_days_later = now + datetime.timedelta(days=7)
    
    total_donors = db.query(models.Donor).count()
    active_donors = db.query(models.Donor).filter(models.Donor.eligibility_status == True).count()
    
    # Active available stock
    available_stock = db.query(models.BloodStock).filter(models.BloodStock.status == "Available").all()
    total_stock_units = len(available_stock)
    total_stock_ml = sum([item.quantity_ml for item in available_stock])
    
    pending_requests_count = db.query(models.BloodRequest).filter(models.BloodRequest.status == "Pending").count()
    expired_units_count = db.query(models.BloodStock).filter(models.BloodStock.status == "Expired").count()
    near_expiry_units_count = db.query(models.BloodStock).filter(
        models.BloodStock.status == "Available",
        models.BloodStock.expiry_date >= now,
        models.BloodStock.expiry_date <= seven_days_later
    ).count()
    
    # Stock breakdown by group
    stock_by_group = []
    for bg in ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]:
        units = db.query(models.BloodStock).filter(
            models.BloodStock.blood_group == bg,
            models.BloodStock.status == "Available"
        ).all()
        stock_by_group.append({
            "blood_group": bg,
            "available_units": len(units),
            "total_ml": sum([u.quantity_ml for u in units])
        })
        
    return {
        "total_donors": total_donors,
        "active_donors": active_donors,
        "total_stock_units": total_stock_units,
        "total_stock_ml": total_stock_ml,
        "pending_requests_count": pending_requests_count,
        "expired_units_count": expired_units_count,
        "near_expiry_units_count": near_expiry_units_count,
        "stock_by_group": stock_by_group
    }

@app.get("/api/dashboard/reports")
def get_reports(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.manager_or_admin)
):
    check_and_update_expired_stock(db)
    
    # Data for reports
    donations = db.query(models.Donation).order_by(models.Donation.collection_date.desc()).all()
    requests = db.query(models.BloodRequest).order_by(models.BloodRequest.request_date.desc()).all()
    
    # Summarized stats
    total_donations = len(donations)
    total_issued = db.query(models.BloodStock).filter(models.BloodStock.status == "Issued").count()
    total_expired = db.query(models.BloodStock).filter(models.BloodStock.status == "Expired").count()
    
    return {
        "summary": {
            "total_donations": total_donations,
            "total_issued": total_issued,
            "total_expired": total_expired
        },
        "donations": [
            {
                "id": d.id,
                "donor_name": d.donor.name if d.donor else "Unknown",
                "blood_group": d.blood_group,
                "quantity_ml": d.quantity_ml,
                "barcode": d.blood_unit_barcode,
                "date": d.collection_date,
                "status": d.status
            } for d in donations
        ],
        "requests": [
            {
                "id": r.id,
                "patient_name": r.patient_name,
                "hospital": r.requesting_hospital,
                "blood_group": r.blood_group,
                "quantity_units": r.quantity_units,
                "urgency": r.urgency,
                "date": r.request_date,
                "status": r.status,
                "notes": r.status_notes
            } for r in requests
        ]
    }

@app.get("/api/dashboard/audit-logs", response_model=List[schemas.AuditLogResponse])
def get_audit_logs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.admin_only)
):
    logs = db.query(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).all()
    # Map usernames manually
    for log in logs:
        if log.user:
            log.username = log.user.username
        else:
            log.username = "SYSTEM"
    return logs


# ==========================================
# STATIC FILES SERVING (SPA FRONTEND)
# ==========================================

# Set up paths for frontend
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

if os.path.exists(frontend_dir):
    # Mount files like style.css, app.js
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    # Fallback to serve index.html for root path
    @app.get("/")
    def read_index():
        index_path = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "Welcome to Blood Donate API. Frontend index.html not found."}
else:
    @app.get("/")
    def read_root():
        return {"message": "Welcome to Blood Donate API. Frontend folder not found."}
