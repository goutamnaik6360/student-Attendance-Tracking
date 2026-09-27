# Smart Attendance Management System - Backend Version

## Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Python Flask
- Database: SQLite
- Face recognition: browser-side face-api.js descriptors
- Photos: stored by the Flask backend

## 1. Install Python

Make sure Python 3.10+ is installed.

Check:

```powershell
python --version
```

## 2. Open the backend folder

```powershell
cd backend
```

## 3. Create virtual environment

```powershell
python -m venv venv
```

Activate it in PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\venv\Scripts\Activate.ps1
```

## 4. Install dependencies

```powershell
pip install -r requirements.txt
```

## 5. Start backend

```powershell
python app.py
```

You should see Flask running on:

http://127.0.0.1:5000

Test it by opening:

http://127.0.0.1:5000/api/health

## 6. Start frontend

Open the `frontend` folder in VS Code.

Install/use the VS Code Live Server extension and open `index.html` with Live Server.

The frontend will normally run on:

http://127.0.0.1:5500

## 7. Test

1. Start Flask.
2. Start Live Server.
3. Open the frontend.
4. Register a student with a clear face photo.
5. Go to Attendance.
6. Start Camera.
7. Show the registered face.
8. The matching student is identified and attendance is sent to SQLite.
9. Restarting the browser does not delete the database.

## Database

The backend automatically creates:

backend/attendance.db

Student photos are stored in:

backend/uploads/
