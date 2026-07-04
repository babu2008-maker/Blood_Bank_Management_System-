from backend.database import SessionLocal
from backend import models, auth


def ensure_viewer():
    db = SessionLocal()
    try:
        if not db.query(models.User).filter(models.User.username == 'viewer').first():
            viewer = models.User(
                username='viewer',
                password_hash=auth.get_password_hash('viewer123'),
                role='inventory',
                email='viewer@bloodbank.org',
                full_name='Inventory Viewer'
            )
            db.add(viewer)
            db.commit()
            print('Viewer user added')
        else:
            print('Viewer user already exists')
    finally:
        db.close()

if __name__ == '__main__':
    ensure_viewer()
