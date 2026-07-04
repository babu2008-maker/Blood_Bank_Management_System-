import datetime
from sqlalchemy.orm import Session
from backend.database import SessionLocal, engine, Base
from backend import models, auth

def seed_database():
    # Ensure tables are created
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. Seed Users if not present
        if db.query(models.User).count() == 0:
            print("Seeding users...")
            users = [
                models.User(
                    username="admin",
                    password_hash=auth.get_password_hash("admin123"),
                    role="admin",
                    email="admin@bloodbank.org",
                    full_name="System Administrator"
                ),
                models.User(
                    username="staff",
                    password_hash=auth.get_password_hash("staff123"),
                    role="staff",
                    email="staff@bloodbank.org",
                    full_name="Jane Staff Member"
                ),
                models.User(
                    username="hospital",
                    password_hash=auth.get_password_hash("hospital123"),
                    role="hospital",
                    email="contact@citygeneral.com",
                    full_name="Dr. Sarah Carter",
                    hospital_name="City General Hospital"
                ),
                models.User(
                    username="manager",
                    password_hash=auth.get_password_hash("manager123"),
                    role="manager",
                    email="manager@bloodbank.org",
                    full_name="Robert Manager"
                )
            ,
                models.User(
                    username="viewer",
                    password_hash=auth.get_password_hash("viewer123"),
                    role="inventory",
                    email="viewer@bloodbank.org",
                    full_name="Inventory Viewer"
                )
            ]
            db.add_all(users)
            db.commit()
            print("Users seeded successfully.")

        # 2. Seed Donors if not present
        if db.query(models.Donor).count() == 0:
            print("Seeding donors...")
            donors = [
                models.Donor(
                    name="John Doe",
                    age=34,
                    gender="Male",
                    blood_group="A+",
                    contact_number="9876543210",
                    email="john.doe@gmail.com",
                    address="123 Main St, Springfield",
                    eligibility_status=True,
                    eligibility_notes="Fit to donate",
                    last_donation_date=datetime.datetime.utcnow() - datetime.timedelta(days=90)
                ),
                models.Donor(
                    name="Jane Smith",
                    age=28,
                    gender="Female",
                    blood_group="O-",
                    contact_number="8765432109",
                    email="jane.smith@yahoo.com",
                    address="456 Elm St, Shelbyville",
                    eligibility_status=True,
                    eligibility_notes="Healthy donor",
                    last_donation_date=datetime.datetime.utcnow() - datetime.timedelta(days=40)
                ),
                models.Donor(
                    name="Robert Johnson",
                    age=45,
                    gender="Male",
                    blood_group="AB+",
                    contact_number="7654321098",
                    email="robert.j@outlook.com",
                    address="789 Oak Ave, Capital City",
                    eligibility_status=False,
                    eligibility_notes="Low hemoglobin, retest in 3 months",
                    last_donation_date=datetime.datetime.utcnow() - datetime.timedelta(days=120)
                ),
                models.Donor(
                    name="Emily Davis",
                    age=31,
                    gender="Female",
                    blood_group="B+",
                    contact_number="6543210987",
                    email="emily.d@gmail.com",
                    address="321 Pine Rd, Springfield",
                    eligibility_status=True,
                    eligibility_notes="Eligible",
                    last_donation_date=None
                )
            ]
            db.add_all(donors)
            db.commit()
            print("Donors seeded successfully.")

        # 3. Seed Donations & BloodStock if not present
        if db.query(models.Donation).count() == 0:
            print("Seeding donations and stock...")
            
            # Fetch donors to link
            donor_john = db.query(models.Donor).filter(models.Donor.name == "John Doe").first()
            donor_jane = db.query(models.Donor).filter(models.Donor.name == "Jane Smith").first()
            donor_emily = db.query(models.Donor).filter(models.Donor.name == "Emily Davis").first()

            # Active/Available stock - 15 days ago (John Doe, A+)
            col_date_john = datetime.datetime.utcnow() - datetime.timedelta(days=15)
            exp_date_john = col_date_john + datetime.timedelta(days=42)
            donation_john = models.Donation(
                donor_id=donor_john.id,
                collection_date=col_date_john,
                quantity_ml=350,
                blood_group="A+",
                blood_unit_barcode="BAR-A-POS-001",
                status="Available"
            )
            db.add(donation_john)
            db.flush() # get donation id
            
            stock_john = models.BloodStock(
                donation_id=donation_john.id,
                blood_group="A+",
                quantity_ml=350,
                unit_barcode="BAR-A-POS-001",
                collection_date=col_date_john,
                expiry_date=exp_date_john,
                status="Available"
            )
            db.add(stock_john)

            # Active stock close to expiry - 40 days ago (Jane Smith, O-)
            # 42 days shelf life means it expires in 2 days
            col_date_jane = datetime.datetime.utcnow() - datetime.timedelta(days=40)
            exp_date_jane = col_date_jane + datetime.timedelta(days=42)
            donation_jane = models.Donation(
                donor_id=donor_jane.id,
                collection_date=col_date_jane,
                quantity_ml=350,
                blood_group="O-",
                blood_unit_barcode="BAR-O-NEG-001",
                status="Available"
            )
            db.add(donation_jane)
            db.flush()
            
            stock_jane = models.BloodStock(
                donation_id=donation_jane.id,
                blood_group="O-",
                quantity_ml=350,
                unit_barcode="BAR-O-NEG-001",
                collection_date=col_date_jane,
                expiry_date=exp_date_jane,
                status="Available"
            )
            db.add(stock_jane)

            # Expired stock - 50 days ago (Emily Davis, B+)
            # Expired 8 days ago
            col_date_emily = datetime.datetime.utcnow() - datetime.timedelta(days=50)
            exp_date_emily = col_date_emily + datetime.timedelta(days=42)
            donation_emily = models.Donation(
                donor_id=donor_emily.id,
                collection_date=col_date_emily,
                quantity_ml=350,
                blood_group="B+",
                blood_unit_barcode="BAR-B-POS-001",
                status="Expired"
            )
            db.add(donation_emily)
            db.flush()
            
            stock_emily = models.BloodStock(
                donation_id=donation_emily.id,
                blood_group="B+",
                quantity_ml=350,
                unit_barcode="BAR-B-POS-001",
                collection_date=col_date_emily,
                expiry_date=exp_date_emily,
                status="Expired"
            )
            db.add(stock_emily)

            # Already Issued stock - O- from Jane Smith, donated 80 days ago, issued 70 days ago
            col_date_jane_old = datetime.datetime.utcnow() - datetime.timedelta(days=80)
            exp_date_jane_old = col_date_jane_old + datetime.timedelta(days=42)
            donation_jane_old = models.Donation(
                donor_id=donor_jane.id,
                collection_date=col_date_jane_old,
                quantity_ml=350,
                blood_group="O-",
                blood_unit_barcode="BAR-O-NEG-002",
                status="Issued"
            )
            db.add(donation_jane_old)
            db.flush()
            
            stock_jane_old = models.BloodStock(
                donation_id=donation_jane_old.id,
                blood_group="O-",
                quantity_ml=350,
                unit_barcode="BAR-O-NEG-002",
                collection_date=col_date_jane_old,
                expiry_date=exp_date_jane_old,
                status="Issued"
            )
            db.add(stock_jane_old)

            db.commit()
            print("Donations and stock seeded successfully.")

        # 4. Seed Blood Requests if not present
        if db.query(models.BloodRequest).count() == 0:
            print("Seeding blood requests...")
            
            staff_user = db.query(models.User).filter(models.User.username == "staff").first()
            
            requests = [
                models.BloodRequest(
                    patient_name="Alice Green",
                    requesting_hospital="City General Hospital",
                    blood_group="A+",
                    quantity_units=1,
                    urgency="High",
                    request_date=datetime.datetime.utcnow() - datetime.timedelta(hours=4),
                    status="Pending",
                    status_notes="Awaiting stock validation"
                ),
                models.BloodRequest(
                    patient_name="Charlie Brown",
                    requesting_hospital="Mercy Clinic",
                    blood_group="O-",
                    quantity_units=1,
                    urgency="Emergency",
                    request_date=datetime.datetime.utcnow() - datetime.timedelta(days=1),
                    status="Fulfilled",
                    fulfiller_id=staff_user.id,
                    status_notes="Dispatched unit BAR-O-NEG-002. Requisition complete."
                ),
                models.BloodRequest(
                    patient_name="Grace Hopper",
                    requesting_hospital="St. Jude Hospital",
                    blood_group="AB-",
                    quantity_units=2,
                    urgency="Medium",
                    request_date=datetime.datetime.utcnow() - datetime.timedelta(days=2),
                    status="Rejected",
                    fulfiller_id=staff_user.id,
                    status_notes="Insufficient inventory of rare group AB-. Patient redirected to central repository."
                )
            ]
            db.add_all(requests)
            db.commit()
            print("Blood requests seeded successfully.")

        # 5. Seed Audit Logs
        if db.query(models.AuditLog).count() == 0:
            print("Seeding audit logs...")
            admin_user = db.query(models.User).filter(models.User.username == "admin").first()
            logs = [
                models.AuditLog(
                    user_id=admin_user.id,
                    action="SYSTEM_INIT",
                    details="Blood Bank Management System database initialized.",
                    timestamp=datetime.datetime.utcnow() - datetime.timedelta(days=5)
                ),
                models.AuditLog(
                    user_id=admin_user.id,
                    action="USER_CREATE",
                    details="Created users: staff, hospital, manager.",
                    timestamp=datetime.datetime.utcnow() - datetime.timedelta(days=5)
                )
            ]
            db.add_all(logs)
            db.commit()
            print("Audit logs seeded successfully.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
