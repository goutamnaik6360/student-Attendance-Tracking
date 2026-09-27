/* =========================================
   SMART ATTENDANCE SYSTEM
   JAVASCRIPT
========================================= */

/* =========================================
   DATA STORAGE
========================================= */

let students = [];
let attendance = [];

let cameraStream = null;
let recognitionTimer = null;
let faceModelsLoaded = false;
let recognitionBusy = false;

const FACE_MODEL_URL =
    "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

/* =========================================
   SAVE DATA
========================================= */

function saveData() {
    // Data is now stored by the Flask backend.
}

const API_BASE = "http://127.0.0.1:5000/api";

async function apiRequest(url, options = {}) {
    const response = await fetch(API_BASE + url, options);

    let data = {};
    try {
        data = await response.json();
    } catch (_) {}

    if (!response.ok) {
        throw new Error(data.error || "Backend request failed.");
    }

    return data;
}


async function checkBackend() {
    try {
        const result = await apiRequest("/health");
        console.log(result.message);
    } catch (error) {
        console.error("Backend connection failed:", error.message);
    }
}

async function loadDataFromBackend() {
    const [studentsData, attendanceData] = await Promise.all([
        apiRequest("/students"),
        apiRequest("/attendance")
    ]);

    students = studentsData.students || [];
    attendance = attendanceData.attendance || [];

    displayStudents();
    displayTodayAttendance();
    displayReports();
    updateDashboard();
}

/* =========================================
   PAGE INITIALIZATION
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        updateDate();

        const photoInput =
            document.getElementById("studentPhoto");

        if (photoInput) {
            photoInput.addEventListener(
                "change",
                previewStudentPhoto
            );
        }

        try {
            await checkBackend();
            await loadDataFromBackend();
        } catch (error) {
            console.error(error);
            showMessage(
                "studentMessage",
                "Backend is not running. Start Flask first.",
                "error"
            );
        }
    }
);

/* =========================================
   SECTION NAVIGATION
========================================= */

function showSection(sectionId) {

    const sections =
        document.querySelectorAll(".section");

    sections.forEach(
        function (section) {
            section.classList.add("hidden");
        }
    );

    const selected =
        document.getElementById(sectionId);

    if (selected) {
        selected.classList.remove("hidden");
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (sectionId === "students") {
        displayStudents();
    }

    if (sectionId === "attendance") {
        displayTodayAttendance();
    }

    if (sectionId === "reports") {
        displayReports();
    }
}

/* =========================================
   NAVIGATION LINKS
========================================= */

document.querySelectorAll(
    ".nav-links a"
).forEach(
    function (link) {

        link.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                const target =
                    this.getAttribute("href")
                        .replace("#", "");

                showSection(target);
            }
        );
    }
);

/* =========================================
   PHOTO PREVIEW
========================================= */

function previewStudentPhoto(event) {

    const file = event.target.files[0];
    const previewBox =
        document.getElementById("photoPreview");
    const preview =
        document.getElementById("studentPhotoPreview");

    if (!file || !previewBox || !preview) {
        return;
    }

    if (!file.type.startsWith("image/")) {
        event.target.value = "";
        previewBox.classList.add("hidden");
        showMessage(
            "studentMessage",
            "Please select an image file.",
            "error"
        );
        return;
    }

    const reader = new FileReader();

    reader.onload = function () {
        preview.src = reader.result;
        previewBox.classList.remove("hidden");
    };

    reader.readAsDataURL(file);
}

/* =========================================
   IMAGE -> FACE DESCRIPTOR
========================================= */

async function createFaceDescriptorFromDataURL(dataURL) {

    const img = await faceapi.fetchImage(dataURL);

    const result =
        await faceapi
            .detectSingleFace(
                img,
                new faceapi.TinyFaceDetectorOptions({
                    inputSize: 320,
                    scoreThreshold: 0.5
                })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();

    if (!result) {
        throw new Error(
            "No clear face was detected in the photo."
        );
    }

    return Array.from(result.descriptor);
}

/* =========================================
   LOAD FACE MODELS
========================================= */

async function loadFaceModels() {

    if (faceModelsLoaded) {
        return;
    }

    setRecognitionStatus(
        "Loading face-recognition models...",
        "info"
    );

    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(
            FACE_MODEL_URL
        ),
        faceapi.nets.faceLandmark68Net.loadFromUri(
            FACE_MODEL_URL
        ),
        faceapi.nets.faceRecognitionNet.loadFromUri(
            FACE_MODEL_URL
        )
    ]);

    faceModelsLoaded = true;

    setRecognitionStatus(
        "Face-recognition models loaded.",
        "success"
    );
}

/* =========================================
   ADD STUDENT
========================================= */

const studentForm =
    document.getElementById("studentForm");

if (studentForm) {

    studentForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();

            const id =
                document.getElementById(
                    "studentId"
                ).value.trim();

            const name =
                document.getElementById(
                    "studentName"
                ).value.trim();

            const email =
                document.getElementById(
                    "studentEmail"
                ).value.trim();

            const department =
                document.getElementById(
                    "studentDepartment"
                ).value.trim();

            const photoInput =
                document.getElementById(
                    "studentPhoto"
                );

            const photoFile =
                photoInput &&
                photoInput.files
                    ? photoInput.files[0]
                    : null;

            if (!id || !name) {
                showMessage(
                    "studentMessage",
                    "Student ID and name are required.",
                    "error"
                );
                return;
            }

            if (!photoFile) {
                showMessage(
                    "studentMessage",
                    "Please upload or capture a student photo.",
                    "error"
                );
                return;
            }

            const exists =
                students.some(
                    function (student) {
                        return (
                            student.id.toLowerCase()
                            ===
                            id.toLowerCase()
                        );
                    }
                );

            if (exists) {
                showMessage(
                    "studentMessage",
                    "This Student ID already exists.",
                    "error"
                );
                return;
            }

            try {

                await loadFaceModels();

                showMessage(
                    "studentMessage",
                    "Checking the student photo...",
                    "info"
                );

                const dataURL =
                    await readFileAsDataURL(photoFile);

                const descriptor =
                    await createFaceDescriptorFromDataURL(
                        dataURL
                    );

                const formData = new FormData();

                formData.append("id", id);
                formData.append("name", name);
                formData.append("email", email);
                formData.append(
                    "department",
                    department || "Not specified"
                );
                formData.append(
                    "photo",
                    photoFile
                );
                formData.append(
                    "faceDescriptor",
                    JSON.stringify(descriptor)
                );

                const result =
                    await apiRequest(
                        "/students",
                        {
                            method: "POST",
                            body: formData
                        }
                    );

                studentForm.reset();

                await loadDataFromBackend();

                const previewBox =
                    document.getElementById(
                        "photoPreview"
                    );

                if (previewBox) {
                    previewBox.classList.add("hidden");
                }

                displayStudents();
                updateDashboard();

                showMessage(
                    "studentMessage",
                    "Student registered with face successfully.",
                    "success"
                );

            } catch (error) {

                console.error(
                    "Student registration error:",
                    error
                );

                showMessage(
                    "studentMessage",
                    error.message ||
                    "Could not process the student photo.",
                    "error"
                );
            }
        }
    );
}

/* =========================================
   READ FILE
========================================= */

function readFileAsDataURL(file) {

    return new Promise(
        function (resolve, reject) {

            const reader =
                new FileReader();

            reader.onload =
                function () {
                    resolve(reader.result);
                };

            reader.onerror =
                function () {
                    reject(
                        new Error(
                            "Could not read the photo."
                        )
                    );
                };

            reader.readAsDataURL(file);
        }
    );
}

/* =========================================
   DISPLAY STUDENTS
========================================= */

function displayStudents() {

    const table =
        document.getElementById(
            "studentTable"
        );

    if (!table) {
        return;
    }

    const searchInput =
        document.getElementById(
            "studentSearch"
        );

    const search =
        searchInput
            ? searchInput.value.toLowerCase()
            : "";

    table.innerHTML = "";

    const filtered =
        students.filter(
            function (student) {

                return (

                    student.id
                        .toLowerCase()
                        .includes(search)

                    ||

                    student.name
                        .toLowerCase()
                        .includes(search)

                    ||

                    student.department
                        .toLowerCase()
                        .includes(search)
                );
            }
        );

    if (filtered.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="4"
                    style="text-align:center;color:#64748b">
                    No students found.
                </td>
            </tr>
        `;

        return;
    }

    filtered.forEach(
        function (student) {

            const row =
                document.createElement("tr");

            row.innerHTML = `
                <td>
                    ${escapeHTML(student.id)}
                </td>

                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        ${
                            student.photo
                            ? `<img src="${student.photo}"
                                    alt="Student"
                                    style="width:38px;height:45px;object-fit:cover;border-radius:6px;">`
                            : ""
                        }
                        <span>${escapeHTML(student.name)}</span>
                    </div>
                </td>

                <td>
                    ${escapeHTML(student.department)}
                </td>

                <td>
                    <button
                        class="btn danger"
                        onclick="deleteStudent('${escapeHTML(student.id)}')"
                    >
                        Delete
                    </button>
                </td>
            `;

            table.appendChild(row);
        }
    );
}

/* =========================================
   DELETE STUDENT
========================================= */

async function deleteStudent(id) {

    const confirmed =
        confirm(
            "Are you sure you want to delete this student?"
        );

    if (!confirmed) {
        return;
    }

    try {
        await apiRequest(
            "/students/" + encodeURIComponent(id),
            { method: "DELETE" }
        );

        await loadDataFromBackend();

    } catch (error) {
        showMessage(
            "studentMessage",
            error.message,
            "error"
        );
    }
}

/* =========================================
   MANUAL ATTENDANCE
========================================= */

async function markManualAttendance() {

    const input =
        document.getElementById(
            "attendanceStudentId"
        );

    const studentId =
        input.value.trim();

    if (!studentId) {

        showMessage(
            "attendanceMessage",
            "Please enter a Student ID.",
            "error"
        );

        return;
    }

    const student =
        students.find(
            function (item) {

                return (
                    item.id.toLowerCase()
                    ===
                    studentId.toLowerCase()
                );
            }
        );

    if (!student) {

        showMessage(
            "attendanceMessage",
            "Student not found.",
            "error"
        );

        return;
    }

    await markAttendanceForStudent(
        student,
        "manual"
    );
}

/* =========================================
   COMMON ATTENDANCE FUNCTION
========================================= */

async function markAttendanceForStudent(
    student,
    source = "camera"
) {

    const today =
        getToday();

    const alreadyMarked =
        attendance.some(
            function (record) {

                return (
                    record.studentId
                        .toLowerCase()
                    ===
                    student.id.toLowerCase()

                    &&

                    record.date === today
                );
            }
        );

    if (alreadyMarked) {

        if (source === "manual") {
            showMessage(
                "attendanceMessage",
                "Attendance is already marked for today.",
                "info"
            );
        }

        return false;
    }

    const now =
        new Date();

    const record = {

        studentId:
            student.id,

        name:
            student.name,

        date:
            today,

        time:
            now.toLocaleTimeString(),

        status:
            "Present",

        source:
            source
    };

    try {
        await apiRequest(
            "/attendance",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(record)
            }
        );

        await loadDataFromBackend();

    } catch (error) {
        showMessage(
            "attendanceMessage",
            error.message,
            "error"
        );
        return false;
    }

    if (source === "manual") {

        const input =
            document.getElementById(
                "attendanceStudentId"
            );

        if (input) {
            input.value = "";
        }

        showMessage(
            "attendanceMessage",
            student.name +
            " marked present successfully.",
            "success"
        );

    } else {

        showMessage(
            "attendanceMessage",
            student.name +
            " identified and marked present automatically.",
            "success"
        );

    }

    return true;
}

/* =========================================
   FACE RECOGNITION
========================================= */

async function recognizeStudentFromCamera() {

    if (
        recognitionBusy ||
        !faceModelsLoaded
    ) {
        return;
    }

    const video =
        document.getElementById("camera");

    if (
        !video ||
        video.readyState < 2 ||
        students.length === 0
    ) {
        return;
    }

    const studentsWithFaces =
        students.filter(
            function (student) {
                return (
                    Array.isArray(
                        student.faceDescriptor
                    )
                    &&
                    student.faceDescriptor.length > 0
                );
            }
        );

    if (studentsWithFaces.length === 0) {
        setRecognitionStatus(
            "No registered face photos found. Register a student photo first.",
            "info"
        );
        return;
    }

    recognitionBusy = true;

    try {

        const detection =
            await faceapi
                .detectSingleFace(
                    video,
                    new faceapi.TinyFaceDetectorOptions({
                        inputSize: 320,
                        scoreThreshold: 0.5
                    })
                )
                .withFaceLandmarks()
                .withFaceDescriptor();

        if (!detection) {

            setRecognitionStatus(
                "Looking for a face...",
                "info"
            );

            return;
        }

        const liveDescriptor =
            detection.descriptor;

        let bestStudent = null;
        let bestDistance = Infinity;

        studentsWithFaces.forEach(
            function (student) {

                const distance =
                    faceapi.euclideanDistance(
                        liveDescriptor,
                        new Float32Array(
                            student.faceDescriptor
                        )
                    );

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestStudent = student;
                }
            }
        );

        /*
           Lower distance = closer facial match.
           0.50 is a conservative starting point.
        */
        const MATCH_THRESHOLD = 0.50;

        if (
            bestStudent &&
            bestDistance <= MATCH_THRESHOLD
        ) {

            const marked =
                await markAttendanceForStudent(
                    bestStudent,
                    "camera"
                );

            if (marked) {

                setRecognitionStatus(
                    "Recognized: " +
                    bestStudent.name +
                    " (" +
                    bestStudent.id +
                    "). Attendance marked Present.",
                    "success"
                );

            } else {

                setRecognitionStatus(
                    "Recognized: " +
                    bestStudent.name +
                    " (" +
                    bestStudent.id +
                    "). Already marked Present today.",
                    "info"
                );
            }

        } else {

            setRecognitionStatus(
                "Face detected, but no registered student matched.",
                "error"
            );
        }

    } catch (error) {

        console.error(
            "Face recognition error:",
            error
        );

    } finally {

        recognitionBusy = false;
    }
}

/* =========================================
   CAMERA
========================================= */

async function startCamera() {

    const video =
        document.getElementById(
            "camera"
        );

    if (!video) {
        return;
    }

    try {

        await loadFaceModels();

        cameraStream =
            await navigator.mediaDevices
                .getUserMedia({
                    video: {
                        facingMode: {
                            ideal: "user"
                        },
                        width: {
                            ideal: 640
                        },
                        height: {
                            ideal: 480
                        }
                    },
                    audio: false
                });

        video.srcObject =
            cameraStream;

        await video.play();

        setRecognitionStatus(
            "Camera started. Looking for a registered student...",
            "info"
        );

        showMessage(
            "attendanceMessage",
            "Camera started. Face recognition is active.",
            "success"
        );

        startRecognitionLoop();

    } catch (error) {

        console.error(error);

        showMessage(
            "attendanceMessage",
            "Camera permission was denied or the camera is unavailable.",
            "error"
        );

        setRecognitionStatus(
            "Camera could not be started.",
            "error"
        );
    }
}

/* =========================================
   RECOGNITION LOOP
========================================= */

function startRecognitionLoop() {

    stopRecognitionLoop();

    recognitionTimer =
        setInterval(
            function () {
                recognizeStudentFromCamera();
            },
            1200
        );
}

function stopRecognitionLoop() {

    if (recognitionTimer) {

        clearInterval(
            recognitionTimer
        );

        recognitionTimer = null;
    }
}

/* =========================================
   STOP CAMERA
========================================= */

function stopCamera() {

    stopRecognitionLoop();

    if (!cameraStream) {
        return;
    }

    cameraStream
        .getTracks()
        .forEach(
            function (track) {
                track.stop();
            }
        );

    cameraStream = null;

    const video =
        document.getElementById(
            "camera"
        );

    if (video) {
        video.srcObject = null;
    }

    setRecognitionStatus(
        "Camera stopped.",
        "info"
    );
}

/* =========================================
   RECOGNITION STATUS
========================================= */

function setRecognitionStatus(
    message,
    type = ""
) {

    const element =
        document.getElementById(
            "faceRecognitionStatus"
        );

    if (!element) {
        return;
    }

    element.textContent =
        message;

    element.className =
        "recognition-status " +
        type;
}

/* =========================================
   TODAY'S ATTENDANCE
========================================= */

function displayTodayAttendance() {

    const table =
        document.getElementById(
            "todayAttendanceTable"
        );

    if (!table) {
        return;
    }

    const today =
        getToday();

    const records =
        attendance.filter(
            function (record) {
                return record.date === today;
            }
        );

    table.innerHTML = "";

    if (records.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="5"
                    style="text-align:center;color:#64748b">
                    No attendance marked today.
                </td>
            </tr>
        `;

        return;
    }

    records.forEach(
        function (record) {

            const row =
                document.createElement("tr");

            row.innerHTML = `
                <td>
                    ${escapeHTML(record.studentId)}
                </td>

                <td>
                    ${escapeHTML(record.name)}
                </td>

                <td>
                    ${escapeHTML(record.date)}
                </td>

                <td>
                    ${escapeHTML(record.time)}
                </td>

                <td>
                    <span class="status-present">
                        Present
                    </span>
                </td>
            `;

            table.appendChild(row);
        }
    );
}

/* =========================================
   REPORTS
========================================= */

function displayReports() {

    const table =
        document.getElementById(
            "reportTable"
        );

    if (!table) {
        return;
    }

    const dateInput =
        document.getElementById(
            "reportDate"
        );

    const selectedDate =
        dateInput
            ? dateInput.value
            : "";

    let records =
        [...attendance];

    if (selectedDate) {

        records =
            records.filter(
                function (record) {
                    return (
                        record.date
                        ===
                        selectedDate
                    );
                }
            );
    }

    table.innerHTML = "";

    records.sort(
        function (a, b) {
            return (
                b.date.localeCompare(a.date)
            );
        }
    );

    if (records.length === 0) {

        table.innerHTML = `
            <tr>
                <td colspan="5"
                    style="text-align:center;color:#64748b">
                    No records found.
                </td>
            </tr>
        `;
    }

    records.forEach(
        function (record) {

            const row =
                document.createElement("tr");

            row.innerHTML = `
                <td>
                    ${escapeHTML(record.studentId)}
                </td>

                <td>
                    ${escapeHTML(record.name)}
                </td>

                <td>
                    ${escapeHTML(record.date)}
                </td>

                <td>
                    ${escapeHTML(record.time)}
                </td>

                <td>
                    <span class="status-present">
                        ${escapeHTML(record.status)}
                    </span>
                </td>
            `;

            table.appendChild(row);
        }
    );

    const totalRecords =
        document.getElementById(
            "totalRecords"
        );

    const presentRecords =
        document.getElementById(
            "presentRecords"
        );

    if (totalRecords) {
        totalRecords.textContent =
            records.length;
    }

    if (presentRecords) {
        presentRecords.textContent =
            records.filter(
                function (record) {
                    return (
                        record.status
                        ===
                        "Present"
                    );
                }
            ).length;
    }
}

/* =========================================
   DASHBOARD
========================================= */

function updateDashboard() {

    const today =
        getToday();

    const presentStudents =
        attendance.filter(
            function (record) {

                return (
                    record.date === today
                    &&
                    record.status === "Present"
                );
            }
        );

    const uniquePresent =
        new Set(
            presentStudents.map(
                function (record) {
                    return record.studentId;
                }
            )
        ).size;

    const total =
        students.length;

    const absent =
        Math.max(
            total - uniquePresent,
            0
        );

    let rate = 0;

    if (total > 0) {

        rate =
            Math.round(
                (
                    uniquePresent
                    /
                    total
                ) * 100
            );
    }

    const totalElement =
        document.getElementById(
            "totalStudents"
        );

    const presentElement =
        document.getElementById(
            "presentToday"
        );

    const absentElement =
        document.getElementById(
            "absentToday"
        );

    const rateElement =
        document.getElementById(
            "attendanceRate"
        );

    if (totalElement) {
        totalElement.textContent =
            total;
    }

    if (presentElement) {
        presentElement.textContent =
            uniquePresent;
    }

    if (absentElement) {
        absentElement.textContent =
            absent;
    }

    if (rateElement) {
        rateElement.textContent =
            rate + "%";
    }
}

/* =========================================
   EXPORT CSV
========================================= */

function exportCSV() {

    if (attendance.length === 0) {

        alert(
            "There are no attendance records to export."
        );

        return;
    }

    let csv =
        "Student ID,Name,Date,Time,Status\n";

    attendance.forEach(
        function (record) {

            csv +=
                `"${record.studentId}",` +
                `"${record.name}",` +
                `"${record.date}",` +
                `"${record.time}",` +
                `"${record.status}"\n`;
        }
    );

    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;

    link.download =
        "attendance_report.csv";

    link.click();

    URL.revokeObjectURL(url);
}

/* =========================================
   DATE
========================================= */

function getToday() {

    const date =
        new Date();

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return (
        year +
        "-" +
        month +
        "-" +
        day
    );
}

/* =========================================
   DISPLAY DATE
========================================= */

function updateDate() {

    const element =
        document.getElementById(
            "todayDate"
        );

    if (element) {

        element.textContent =
            new Date()
                .toLocaleDateString();
    }
}

/* =========================================
   MESSAGE
========================================= */

function showMessage(
    elementId,
    text,
    type
) {

    const element =
        document.getElementById(
            elementId
        );

    if (!element) {
        return;
    }

    element.textContent =
        text;

    element.className =
        "message " + type;

    setTimeout(
        function () {

            element.className =
                "message";

        },
        5000
    );
}

/* =========================================
   SECURITY HELPER
========================================= */

function escapeHTML(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value;

    return div.innerHTML;
}
