import os
import sys
import subprocess
import webbrowser
import threading
import time

def setup_environment():
    print("=== Setting up Blood Donate Environment ===")
    
    # Check if requirements.txt exists
    if not os.path.exists("requirements.txt"):
        print("Error: requirements.txt not found in current directory.", file=sys.stderr)
        sys.exit(1)
        
    # Check if .venv exists, if not create it
    venv_dir = ".venv"
    if not os.path.exists(venv_dir):
        print("Creating virtual environment (.venv)...")
        try:
            subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)
            print("Virtual environment created.")
        except subprocess.CalledProcessError as e:
            print(f"Failed to create virtual environment: {e}. Fallback to global Python environment.", file=sys.stderr)
            return sys.executable
            
    # Locate virtualenv python executable
    if sys.platform == "win32":
        venv_python = os.path.join(venv_dir, "Scripts", "python.exe")
    else:
        venv_python = os.path.join(venv_dir, "bin", "python")
        
    if not os.path.exists(venv_python):
        print("Virtual environment python not found, fallback to default interpreter.", file=sys.stderr)
        return sys.executable
        
    # Install dependencies
    print("Installing python package dependencies inside virtualenv...")
    try:
        subprocess.run([venv_python, "-m", "pip", "install", "-r", "requirements.txt"], check=True)
        print("Dependencies installed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Warning: Package installation returned non-zero code: {e}. Attempting to run anyway...", file=sys.stderr)
        
    return venv_python

def seed_database(python_exe):
    print("=== Initializing & Seeding Database ===")
    # Prefer running as a module when `backend` is a package, otherwise run the script file directly.
    seed_script_path = os.path.join("backend", "database_seed.py")
    try:
        if os.path.exists(os.path.join("backend", "__init__.py")):
            subprocess.run([python_exe, "-m", "backend.database_seed"], check=True)
        elif os.path.exists(seed_script_path):
            subprocess.run([python_exe, seed_script_path], check=True)
        else:
            print("Error: backend/database_seed not found.", file=sys.stderr)
            sys.exit(1)

        print("Database checked and prepared successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error seeding database: {e}", file=sys.stderr)
        sys.exit(1)

def open_browser():
    # Wait for server to start up
    time.sleep(2.0)
    print("\n=== Opening Blood Donate in your browser ===")
    webbrowser.open("http://127.0.0.1:8000")

def start_server(python_exe):
    print("=== Starting FastAPI Application Server ===")
    print("Access the dashboard at http://127.0.0.1:8000")
    print("Press Ctrl+C to stop the server.\n")
    
    # Start thread to open browser
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run uvicorn
    import os  # Add this at the top of the file if it's not already there

    try:
     subprocess.run([
        python_exe,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host", "0.0.0.0",
        "--port", os.environ.get("PORT", "8000")
    ])
    except KeyboardInterrupt:
        print("\nServer stopped by user.")
    except Exception as e:
        print(f"Server error: {e}", file=sys.stderr)

if __name__ == "__main__":
    # Ensure current working directory is the project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Setup venv and get its python executable
    python_exe = setup_environment()
    
    # Seed database with mock data
    seed_database(python_exe)
    
    # Launch uvicorn and web interface
    start_server(python_exe)
