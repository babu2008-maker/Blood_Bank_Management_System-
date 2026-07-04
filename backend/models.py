import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin, staff, hospital, manager
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hospital_name = Column(String, nullable=True)  # Only relevant for hospital users
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    requests_fulfilled = relationship("BloodRequest", back_populates="fulfiller")
    audit_logs = relationship("AuditLog", back_populates="user")

class Donor(Base):
    __tablename__ = "donors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    blood_group = Column(String, index=True, nullable=False)  # A+, A-, B+, B-, AB+, AB-, O+, O-
    contact_number = Column(String, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    address = Column(String, nullable=True)
    eligibility_status = Column(Boolean, default=True)  # True = Eligible, False = Temporary/Permanent Ineligible
    eligibility_notes = Column(String, nullable=True)
    last_donation_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    donations = relationship("Donation", back_populates="donor")

class Donation(Base):
    __tablename__ = "donations"

    id = Column(Integer, primary_key=True, index=True)
    donor_id = Column(Integer, ForeignKey("donors.id"), nullable=False)
    collection_date = Column(DateTime, default=datetime.datetime.utcnow)
    quantity_ml = Column(Integer, default=350)  # Standard donation is ~350ml or 450ml
    blood_group = Column(String, nullable=False)
    blood_unit_barcode = Column(String, unique=True, index=True, nullable=False)
    status = Column(String, default="Available")  # Available, Expired, Issued

    # Relationships
    donor = relationship("Donor", back_populates="donations")
    stock_item = relationship("BloodStock", uselist=False, back_populates="donation")

class BloodStock(Base):
    __tablename__ = "blood_stock"

    id = Column(Integer, primary_key=True, index=True)
    donation_id = Column(Integer, ForeignKey("donations.id"), nullable=True)
    blood_group = Column(String, index=True, nullable=False)
    quantity_ml = Column(Integer, nullable=False)
    unit_barcode = Column(String, unique=True, index=True, nullable=False)
    collection_date = Column(DateTime, default=datetime.datetime.utcnow)
    expiry_date = Column(DateTime, nullable=False)  # Usually collection_date + 35 or 42 days
    status = Column(String, default="Available", index=True)  # Available, Expired, Issued

    # Relationships
    donation = relationship("Donation", back_populates="stock_item")

class BloodRequest(Base):
    __tablename__ = "blood_requests"

    id = Column(Integer, primary_key=True, index=True)
    patient_name = Column(String, nullable=False)
    requesting_hospital = Column(String, nullable=False)
    blood_group = Column(String, index=True, nullable=False)
    quantity_units = Column(Integer, default=1)  # Units of blood (each unit is ~350-450ml)
    urgency = Column(String, nullable=False)  # Low, Medium, High, Emergency
    request_date = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="Pending", index=True)  # Pending, Approved, Rejected, Fulfilled
    fulfiller_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status_notes = Column(String, nullable=True)

    # Relationships
    fulfiller = relationship("User", back_populates="requests_fulfilled")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)  # e.g., "LOGIN", "REGISTER_DONOR", "ADD_STOCK", "FULFILL_REQUEST"
    details = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="audit_logs")
