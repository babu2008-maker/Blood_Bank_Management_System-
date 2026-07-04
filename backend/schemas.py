from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime

# --- USER SCHEMAS ---
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    role: str  # admin, staff, hospital, manager
    hospital_name: Optional[str] = None

class UserCreate(UserBase):
    password: str


class PublicRegister(BaseModel):
    username: str
    password: str
    email: EmailStr
    full_name: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str
    full_name: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None


# --- DONOR SCHEMAS ---
class DonorBase(BaseModel):
    name: str
    age: int
    gender: str
    blood_group: str
    contact_number: str
    email: EmailStr
    address: Optional[str] = None
    eligibility_status: Optional[bool] = True
    eligibility_notes: Optional[str] = None

class DonorCreate(DonorBase):
    pass

class DonorUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    contact_number: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    eligibility_status: Optional[bool] = None
    eligibility_notes: Optional[str] = None
    last_donation_date: Optional[datetime] = None

class DonorResponse(DonorBase):
    id: int
    last_donation_date: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- DONATION SCHEMAS ---
class DonationBase(BaseModel):
    donor_id: int
    quantity_ml: int = 350
    blood_group: str
    blood_unit_barcode: str

class DonationCreate(DonationBase):
    pass

class DonationResponse(DonationBase):
    id: int
    collection_date: datetime
    status: str

    class Config:
        from_attributes = True


# --- BLOOD STOCK SCHEMAS ---
class BloodStockBase(BaseModel):
    blood_group: str
    quantity_ml: int
    unit_barcode: str
    expiry_date: datetime

class BloodStockResponse(BloodStockBase):
    id: int
    donation_id: Optional[int] = None
    collection_date: datetime
    status: str
    is_expired: bool = False

    class Config:
        from_attributes = True


# --- BLOOD REQUEST SCHEMAS ---
class BloodRequestBase(BaseModel):
    patient_name: str
    requesting_hospital: str
    blood_group: str
    quantity_units: int = 1
    urgency: str  # Low, Medium, High, Emergency

class BloodRequestCreate(BloodRequestBase):
    pass

class BloodRequestUpdateStatus(BaseModel):
    status: str  # Approved, Rejected, Fulfilled, Pending
    status_notes: Optional[str] = None

class BloodRequestResponse(BloodRequestBase):
    id: int
    request_date: datetime
    status: str
    fulfiller_id: Optional[int] = None
    status_notes: Optional[str] = None

    class Config:
        from_attributes = True


# --- AUDIT LOG SCHEMA ---
class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    details: str
    timestamp: datetime
    username: Optional[str] = None

    class Config:
        from_attributes = True


# --- DASHBOARD SCHEMAS ---
class BloodGroupStockSummary(BaseModel):
    blood_group: str
    available_units: int
    total_ml: int

class DashboardSummary(BaseModel):
    total_donors: int
    active_donors: int
    total_stock_units: int
    total_stock_ml: int
    pending_requests_count: int
    expired_units_count: int
    near_expiry_units_count: int
    stock_by_group: List[BloodGroupStockSummary]
