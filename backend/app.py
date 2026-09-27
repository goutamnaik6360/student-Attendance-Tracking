from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import json
import os
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "attendance.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT,
            department TEXT,
            photo_filename TEXT,
            face_descriptor TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            status TEXT NOT NULL,
            source TEXT,
            FOREIGN KEY(student_id) REFERENCES students(id)
        )
    """)

    conn.commit()
    conn.close()


def student_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"] or "",
        "department": row["department"] or "Not specified",
        "photo": (
            f"/uploads/{row['photo_filename']}"
            if row["photo_filename"]
            else ""
        ),
        "faceDescriptor": json.loads(row["face_descriptor"]),
        "createdAt": row["created_at"]
    }


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "message": "Smart Attendance backend is running."})


@app.get("/api/students")
def get_students():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM students ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    return jsonify({
        "students": [student_to_dict(row) for row in rows]
    })


@app.post("/api/students")
def create_student():
    student_id = request.form.get("id", "").strip()
    name = request.form.get("name", "").strip()
    email = request.form.get("email", "").strip()
    department = request.form.get("department", "Not specified").strip()
    descriptor_text = request.form.get("faceDescriptor", "")
    photo = request.files.get("photo")

    if not student_id or not name:
        return jsonify({"error": "Student ID and name are required."}), 400

    if not photo:
        return jsonify({"error": "Student photo is required."}), 400

    try:
        descriptor = json.loads(descriptor_text)
        if not isinstance(descriptor, list) or len(descriptor) == 0:
            raise ValueError
    except Exception:
        return jsonify({"error": "Invalid face descriptor."}), 400

    conn = get_db()

    existing = conn.execute(
        "SELECT id FROM students WHERE lower(id) = lower(?)",
        (student_id,)
    ).fetchone()

    if existing:
        conn.close()
        return jsonify({"error": "This Student ID already exists."}), 409

    extension = os.path.splitext(photo.filename or "")[1].lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        extension = ".jpg"

    safe_name = f"{student_id}_{int(datetime.now().timestamp())}{extension}"
    photo.save(os.path.join(UPLOAD_DIR, safe_name))

    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn.execute(
        """
        INSERT INTO students
        (id, name, email, department, photo_filename, face_descriptor, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            student_id,
            name,
            email,
            department or "Not specified",
            safe_name,
            json.dumps(descriptor),
            created_at
        )
    )

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Student registered successfully.",
        "studentId": student_id
    }), 201


@app.delete("/api/students/<student_id>")
def delete_student(student_id):
    conn = get_db()

    row = conn.execute(
        "SELECT photo_filename FROM students WHERE id = ?",
        (student_id,)
    ).fetchone()

    if not row:
        conn.close()
        return jsonify({"error": "Student not found."}), 404

    conn.execute(
        "DELETE FROM attendance WHERE student_id = ?",
        (student_id,)
    )
    conn.execute(
        "DELETE FROM students WHERE id = ?",
        (student_id,)
    )

    conn.commit()
    conn.close()

    if row["photo_filename"]:
        path = os.path.join(
            UPLOAD_DIR,
            row["photo_filename"]
        )
        if os.path.exists(path):
            os.remove(path)

    return jsonify({"message": "Student deleted successfully."})


@app.get("/api/attendance")
def get_attendance():
    conn = get_db()
    rows = conn.execute(
        """
        SELECT student_id, name, date, time, status, source
        FROM attendance
        ORDER BY date DESC, time DESC
        """
    ).fetchall()
    conn.close()

    return jsonify({
        "attendance": [
            {
                "studentId": row["student_id"],
                "name": row["name"],
                "date": row["date"],
                "time": row["time"],
                "status": row["status"],
                "source": row["source"] or ""
            }
            for row in rows
        ]
    })


@app.post("/api/attendance")
def create_attendance():
    data = request.get_json(silent=True) or {}

    student_id = str(data.get("studentId", "")).strip()
    name = str(data.get("name", "")).strip()
    date = str(data.get("date", "")).strip()
    time = str(data.get("time", "")).strip()
    status = str(data.get("status", "Present")).strip()
    source = str(data.get("source", "camera")).strip()

    if not student_id or not name or not date or not time:
        return jsonify({"error": "Incomplete attendance data."}), 400

    conn = get_db()

    student = conn.execute(
        "SELECT id, name FROM students WHERE lower(id) = lower(?)",
        (student_id,)
    ).fetchone()

    if not student:
        conn.close()
        return jsonify({"error": "Student does not exist."}), 404

    existing = conn.execute(
        """
        SELECT id FROM attendance
        WHERE lower(student_id) = lower(?) AND date = ?
        """,
        (student_id, date)
    ).fetchone()

    if existing:
        conn.close()
        return jsonify({
            "error": "Attendance is already marked for today."
        }), 409

    conn.execute(
        """
        INSERT INTO attendance
        (student_id, name, date, time, status, source)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            student_id,
            name,
            date,
            time,
            status,
            source
        )
    )

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Attendance saved successfully."
    }), 201


@app.get("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


if __name__ == "__main__":
    init_db()
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
