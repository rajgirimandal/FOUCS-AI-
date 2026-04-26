// =====================
// GLOBAL ELEMENTS / STATE
// =====================
const splashScreen   = document.getElementById('splash-screen');
const modeSelection  = document.getElementById('modeSelection');
const classApp       = document.getElementById('classApp');
const examApp        = document.getElementById('examApp');
const studentsView   = document.getElementById('studentsView');
const settingsView   = document.getElementById('settingsView');
const mainMenu       = document.getElementById('mainMenu');
const alarmSound     = document.getElementById('alarmSound');

let currentTheme = 'light';
let currentMode  = null;

// =====================
// INITIAL SETUP
// =====================
document.addEventListener('DOMContentLoaded', () => {
    // Splash → Mode selection
    setTimeout(() => {
        splashScreen.classList.add('hidden');
        modeSelection.classList.remove('hidden');
    }, 3000);

    const themeSelect   = document.getElementById('themeSelect');
    const fontSizeRange = document.getElementById('fontSizeRange');

    if (themeSelect) {
        themeSelect.addEventListener('change', () => {
            applyTheme(themeSelect.value);
        });
    }

    if (fontSizeRange) {
        fontSizeRange.addEventListener('input', (e) => {
            applyFontSize(e.target.value);
        });
        applyFontSize(fontSizeRange.value);
    }

    updateActiveStudentUI();
});

// =====================
// NAVIGATION & VIEWS
// =====================
function toggleMainMenu() {
    mainMenu.classList.toggle('hidden');
}
function closeMainMenu() {
    mainMenu.classList.add('hidden');
}

function hideAllViews() {
    modeSelection.classList.add('hidden');
    classApp.classList.add('hidden');
    examApp.classList.add('hidden');
    studentsView.classList.add('hidden');
    settingsView.classList.add('hidden');
}

function goHome() {
    if (isRunning) stopSystem();
    stopExamSystem();
    hideAllViews();
    modeSelection.classList.remove('hidden');
    closeMainMenu();
}

function openStudents() {
    if (isRunning) stopSystem();
    stopExamSystem();
    hideAllViews();
    studentsView.classList.remove('hidden');
    closeMainMenu();
}

function openSettings() {
    hideAllViews();
    settingsView.classList.remove('hidden');
    closeMainMenu();
}

function selectMode(mode) {
    hideAllViews();
    if (mode === 'class') {
        classApp.classList.remove('hidden');
        currentMode = 'class';
    } else if (mode === 'exam') {
        examApp.classList.remove('hidden');
        currentMode = 'exam';
        initExamSystem();
    }
    closeMainMenu();
}

// =====================
// THEME & FONT
// =====================
function applyTheme(theme) {
    currentTheme = theme;
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect && themeSelect.value !== theme) {
        themeSelect.value = theme;
    }
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

function applyFontSize(percent) {
    document.documentElement.style.fontSize = percent + '%';
    const fontSizeValue = document.getElementById('fontSizeValue');
    if (fontSizeValue) {
        fontSizeValue.innerText = percent + '%';
    }
}

// =====================
// CLASS MODE (FOCUS)
// =====================
let detector;
let isRunning = false;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let stream = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const loader = document.getElementById('loader');
const initBtn = document.getElementById('initBtn');
const recordStatus = document.getElementById('recordStatus');
const recordText = document.getElementById('recordText');

const countDisplay = document.getElementById('countDisplay');
const focusDisplay = document.getElementById('focusDisplay');
const senseSlider  = document.getElementById('sensitivity');
const senseVal     = document.getElementById('senseVal');

let STRICTNESS_THRESHOLD = 0.5;

senseSlider.oninput = (e) => {
    STRICTNESS_THRESHOLD = e.target.value / 100;
    senseVal.innerText = e.target.value + "%";
};

async function toggleSystem() {
    if (!isRunning) {
        await initSystem();
    } else {
        stopSystem();
    }
}

async function initSystem() {
    loader.classList.remove("hidden");
    initBtn.disabled = true;

    try {
        await tf.ready();
        await tf.setBackend('webgl');

        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, facingMode: 'user' }
        });

        video.srcObject = stream;
        await new Promise(res => video.onloadedmetadata = res);
        video.play();

        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;

        detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            {
                modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
                enableSmoothing: true,
                minPoseScore: 0.25
            }
        );

        loader.classList.add("hidden");
        isRunning = true;

        initBtn.disabled = false;
        initBtn.innerText = "STOP SYSTEM";
        initBtn.classList.remove("bg-yellow-400", "hover:bg-yellow-300", "text-black");
        initBtn.classList.add("bg-red-600", "hover:bg-red-500", "text-white");

        startRecording();
        renderLoop();

    } catch (err) {
        alert("Error starting webcam or AI: " + err.message);
        loader.classList.add("hidden");
        initBtn.disabled = false;
    }
}

function stopSystem() {
    isRunning = false;

    if (isRecording && mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }

    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }

    initBtn.innerText = "START SYSTEM";
    initBtn.classList.remove("bg-red-600", "hover:bg-red-500", "text-white");
    initBtn.classList.add("bg-yellow-400", "hover:bg-yellow-300", "text-black");

    recordStatus.classList.add("hidden");
    recordStatus.classList.remove("recording-status");
    recordText.classList.add("hidden");
}

async function renderLoop() {
    if (!isRunning) return;

    const poses = await detector.estimatePoses(video, {
        maxPoses: 20,
        flipHorizontal: false
    });

    drawResults(poses);
    requestAnimationFrame(renderLoop);
}

function drawResults(poses) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let focusedCount = 0;
    let total = 0;

    poses.forEach(pose => {
        if (pose.score < 0.25) return;
        total++;

        const nose = pose.keypoints.find(k => k.name === "nose");
        const ls   = pose.keypoints.find(k => k.name === "left_shoulder");
        const rs   = pose.keypoints.find(k => k.name === "right_shoulder");

        let focused = false;

        if (ls && rs && ls.score > 0.3 && rs.score > 0.3) {
            const center = (ls.x + rs.x) / 2;
            const width  = Math.abs(ls.x - rs.x);

            if (nose && nose.score > 0.3) {
                const offset  = Math.abs(nose.x - center);
                const allowed = width * (1 - STRICTNESS_THRESHOLD);
                if (offset < allowed) focused = true;
            }
        }

        if (focused) focusedCount++;

        const color = focused ? "#059669" : "#dc2626";

        if (nose) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(nose.x, nose.y, 40, 0, 2 * Math.PI);
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.font = "bold 14px Arial";
            ctx.fillText(focused ? "FOCUSED" : "DISTRACTED", nose.x - 30, nose.y - 50);
        }

        if (ls && rs) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(ls.x, ls.y);
            ctx.lineTo(rs.x, rs.y);
            ctx.stroke();
        }
    });

    countDisplay.innerText = total;
    const pct = total > 0 ? Math.round((focusedCount / total) * 100) : 0;
    focusDisplay.innerText = pct + "%";

    if (pct > 80) focusDisplay.className = "text-2xl font-bold focused-text";
    else if (pct > 50) focusDisplay.className = "text-2xl font-bold warning-text";
    else focusDisplay.className = "text-2xl font-bold danger-text";
}

// -------- CLASS RECORDING ----------
function startRecording() {
    if (!stream) {
        console.warn("No stream to record.");
        return;
    }

    try {
        recordedChunks = [];

        mediaRecorder = new MediaRecorder(stream, {
            mimeType: "video/webm;codecs=vp9"
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            isRecording = false;

            if (recordedChunks.length > 0) {
                const shouldDownload = confirm("Do you want to download the recorded video for this session?");
                if (shouldDownload) {
                    saveRecording();
                } else {
                    recordedChunks = [];
                }
            }
        };

        mediaRecorder.start();
        isRecording = true;

        recordStatus.classList.remove("hidden");
        recordStatus.classList.add("recording-status");
        recordText.classList.remove("hidden");

        console.log("Class Recording started.");
    } catch (err) {
        alert("Error starting recording: " + err.message);
    }
}

function saveRecording() {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `focusai-class-${timestamp}.webm`;

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);

    console.log("Class recording saved.");
}

window.addEventListener("beforeunload", () => {
    if (isRecording && mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
});

// =====================
// EXAM MODE
// =====================
let examStream = null;
let examIsRunning = false;
let examDetector = null;

const examVideo  = document.getElementById('examVideo');
const examCanvas = document.getElementById('examCanvas');
const examCtx    = examCanvas.getContext('2d');
const examLoader = document.getElementById('examLoader');

const examTotalDisplay   = document.getElementById('examTotalDisplay');
const examSuspectDisplay = document.getElementById('examSuspectDisplay');
const examStatusText     = document.getElementById('examStatusText');

let handDetector = null;
let detectedHands = [];

// -------- HANDS --------
async function initHands() {
    if (handDetector) return;
    handDetector = new Hands({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });
    handDetector.setOptions({
        maxNumHands: 4,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    handDetector.onResults(res => {
        detectedHands = res.multiHandLandmarks || [];
    });
}

function runHands() {
    if (!handDetector || !examVideo) return;
    handDetector.send({ image: examVideo });
}

// -------- NOISE (MIC) --------
let audioContext;
let analyser;
let microphone;
let audioDataArray;
let noiseActive = false;
let noiseThreshold = 0.18;
let noiseSuspicionCooldown = false;
let lastAvgVolume = 0;

function startNoiseMonitoring() {
    if (noiseActive) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        analyser.fftSize = 512;

        audioDataArray = new Uint8Array(analyser.frequencyBinCount);
        microphone.connect(analyser);

        noiseActive = true;
        monitorNoise();
        console.log("Noise Detection ON ✔");
    }).catch(err => {
        console.warn("Mic access blocked:", err.message);
    });
}

function monitorNoise() {
    if (!noiseActive) return;

    analyser.getByteFrequencyData(audioDataArray);

    let sum = 0;
    for (let i = 0; i < audioDataArray.length; i++) sum += audioDataArray[i];
    const avgVolume = sum / audioDataArray.length / 255;

    lastAvgVolume = avgVolume;

    if (avgVolume > noiseThreshold && !noiseSuspicionCooldown) {
        examStatusText.innerText = "Talking / whisper detected 🎤";
        examStatusText.style.color = "#dc2626";
        setTimeout(() => examStatusText.style.color = "#475569", 2000);
        noiseSuspicionCooldown = true;
        setTimeout(() => {
            noiseSuspicionCooldown = false;
        }, 3000);
    }

    requestAnimationFrame(monitorNoise);
}

// -------- HEATMAP --------
let cheatPoints = [];
let heatDecayTime = 20000; // 20 seconds

function drawHeatmap(ctx) {
    const now = Date.now();
    cheatPoints = cheatPoints.filter(p => now - p.time < heatDecayTime);

    cheatPoints.forEach(p => {
        const age   = (now - p.time) / heatDecayTime;
        const alpha = 1 - age;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 60, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,0,0,${alpha * 0.4})`;
        ctx.fill();
    });
}

// -------- EXAM RECORDING BUFFER (for clips) --------
let examRecorder;
let examChunks = [];
let clipBuffer = [];
let bufferTime = 5000;
let lastClipSaved = 0;
let clipCooldown = 7000;

function startExamRecording() {
    const stream = examVideo.srcObject;
    if (!stream) return;

    examChunks = [];
    examRecorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });

    examRecorder.ondataavailable = e => {
        if (e.data.size > 0) {
            examChunks.push(e.data);
            clipBuffer.push({ data: e.data, time: Date.now() });
            clipBuffer = clipBuffer.filter(f => Date.now() - f.time < bufferTime);
        }
    };

    examRecorder.start(200);
    console.log("Evidence Clip Buffer Active ✔");
}

function stopExamRecording() {
    if (examRecorder && examRecorder.state !== "inactive") {
        examRecorder.stop();
    }
}

function saveEvidenceClip() {
    const now = Date.now();
    if (now - lastClipSaved < clipCooldown) return;
    lastClipSaved = now;

    if (clipBuffer.length === 0) return;

    const clipData = clipBuffer.map(f => f.data);
    const blob = new Blob(clipData, { type: "video/webm" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `cheatEvidence_${timestamp}.webm`;
    a.click();

    console.log("Evidence Clip Saved 🎥🚨");
}

// -------- TIMELINE DATA --------
let timelineData = [];
let lastRecordTime = Date.now();

// -------- COCO-SSD PHONE + PAPER (BOOK) DETECTION --------
let phoneDetector = null;
let lastPhoneAlert = 0;
let phoneAlertCooldown = 4000;

// For full-frame cheat snapshots
let lastCheatSnapshotTime = 0;
const cheatSnapshotCooldown = 5000; // ms

async function initExamSystem() {
    if (examIsRunning) return;
    examLoader.classList.remove('hidden');

    try {
        await tf.ready();
        await tf.setBackend('webgl');

        examStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 1920,
                height: 1080,
                facingMode: 'environment'
            }
        });

        examVideo.srcObject = examStream;
        await new Promise(res => examVideo.onloadedmetadata = res);
        await examVideo.play();

        examCanvas.width  = examVideo.videoWidth;
        examCanvas.height = examVideo.videoHeight;

        examDetector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            {
                modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
                enableSmoothing: true,
                minPoseScore: 0.15
            }
        );

        await initHands();
        startNoiseMonitoring();
        startExamRecording();

        // Load COCO-SSD for phone + paper-like objects
        phoneDetector = await cocoSsd.load();
        console.log("Phone & Paper Detection Model Ready 📱📄");

        examLoader.classList.add('hidden');
        examIsRunning = true;
        examStatusText.innerText = "Exam AI running · Watching head, hands, phone, paper & noise.";

        examRenderLoop();

    } catch (err) {
        alert("Error starting exam camera or AI: " + err.message);
        examLoader.classList.add('hidden');
    }
}

function stopExamSystem() {
    if (!examIsRunning) return;

    examIsRunning = false;
    stopExamRecording();

    if (examStream) {
        examStream.getTracks().forEach(t => t.stop());
        examStream = null;
    }

    generateExamReport();
    timelineData = [];
}

async function examRenderLoop() {
    if (!examIsRunning || !examDetector) return;

    runHands();
    const poses = await examDetector.estimatePoses(examVideo, {
        maxPoses: 30,
        flipHorizontal: false
    });

    examCtx.clearRect(0, 0, examCanvas.width, examCanvas.height);
    examCtx.drawImage(examVideo, 0, 0, examCanvas.width, examCanvas.height);
    examCtx.fillStyle = "rgba(0,0,0,0.25)";
    examCtx.fillRect(0, 0, examCanvas.width, examCanvas.height);

    drawExamResults(poses);

    // Phone + paper detection
    await detectCheatObjects();

    requestAnimationFrame(examRenderLoop);
}

// Simple gesture check
function analyzeGesture() {
    let suspicious = false;

    detectedHands.forEach(hand => {
        const wrist = hand[0];
        const thumb = hand[4];
        const pinky = hand[20];

        const palmWidth = Math.abs(thumb.x - pinky.x);
        const isLow      = wrist.y > 0.65;

        if (palmWidth < 0.05 && isLow) {
            suspicious = true;
        }
    });

    return suspicious;
}

function drawExamResults(poses) {
    let total    = 0;
    let suspects = 0;

    poses.forEach(pose => {
        if (pose.score < 0.10) return;
        total++;

        const nose = pose.keypoints.find(k => k.name === "nose");
        const ls   = pose.keypoints.find(k => k.name === "left_shoulder");
        const rs   = pose.keypoints.find(k => k.name === "right_shoulder");

        if (!nose || !ls || !rs) return;
        if (nose.score < 0.25 || ls.score < 0.25 || rs.score < 0.25) return;

        const centerX        = (ls.x + rs.x) / 2;
        const shouldersWidth = Math.abs(ls.x - rs.x) || 1;
        const headOffsetX    = Math.abs(nose.x - centerX);
        const headTurnRatio  = headOffsetX / shouldersWidth;

        const shouldersY     = (ls.y + rs.y) / 2;
        const headDownOffset = nose.y - shouldersY;
        const headDownRatio  = headDownOffset / (shouldersWidth * 1.2);

        let suspicionScore = 0;

        if (headTurnRatio > 0.20) suspicionScore += 1;
        if (headTurnRatio > 0.30) suspicionScore += 1;

        if (headDownRatio > 0.15) suspicionScore += 1;
        if (headDownRatio > 0.25) suspicionScore += 1;

        if (lastAvgVolume > noiseThreshold) {
            suspicionScore += 1;
        }

        if (analyzeGesture()) {
            suspicionScore += 2;
        }

        const suspicious = suspicionScore >= 2;
        if (suspicious) {
            suspects++;
            cheatPoints.push({ x: nose.x, y: nose.y, time: Date.now() });
            if (suspicionScore >= 3) {
                saveEvidenceClip();
            }
        }

        const color = suspicious ? "#dc2626" : "#16a34a";
        const label = suspicious ? "SUSPECT" : "OK";

        examCtx.strokeStyle = color;
        examCtx.lineWidth = 2;
        examCtx.beginPath();
        examCtx.arc(nose.x, nose.y, shouldersWidth * 0.9, 0, 2 * Math.PI);
        examCtx.stroke();

        examCtx.fillStyle = color;
        examCtx.font = "bold 12px Arial";
        examCtx.fillText(label, nose.x - 20, nose.y - shouldersWidth);

        examCtx.strokeStyle = color;
        examCtx.lineWidth = 3;
        examCtx.beginPath();
        examCtx.moveTo(ls.x, ls.y);
        examCtx.lineTo(rs.x, rs.y);
        examCtx.stroke();
    });

    drawHeatmap(examCtx);

    if (total === 0) total = 1;
    examTotalDisplay.innerText   = total;
    examSuspectDisplay.innerText = suspects;

    if (Date.now() - lastRecordTime > 1000) {
        timelineData.push({
            time: new Date().toLocaleTimeString(),
            suspects: suspects
        });
        lastRecordTime = Date.now();
    }
}

// =====================
// CHEATING OBJECTS (PHONE + PAPER/BOOK)
// =====================
async function detectCheatObjects() {
    if (!phoneDetector || !examVideo) return;

    const predictions = await phoneDetector.detect(examVideo);

    // Classes we treat as cheating: phone + paper-like
    const cheatClasses = ["cell phone", "book"]; // "book" used as paper-like

    predictions.forEach(pred => {
        if (!cheatClasses.includes(pred.class)) return;
        if (pred.score < 0.50) return;

        const [x, y, w, h] = pred.bbox;
        const isPhone = pred.class === "cell phone";
        const label = isPhone ? "PHONE DETECTED 🚨" : "CHEAT SHEET 🚨";

        // Draw bounding box
        examCtx.strokeStyle = "red";
        examCtx.lineWidth = 4;
        examCtx.strokeRect(x, y, w, h);

        examCtx.fillStyle = "red";
        examCtx.font = "bold 18px Arial";
        examCtx.fillText(label, x, y - 8);

        const now = Date.now();
        if (now - lastPhoneAlert > phoneAlertCooldown) {
            lastPhoneAlert = now;

            examStatusText.innerText = `CHEATING: ${isPhone ? "Phone" : "Paper / Book"} Detected!`;
            examStatusText.style.color = "#dc2626";
            examCanvas.classList.add("phone-alert-border");

            if (alarmSound) {
                alarmSound.play().catch(() => {});
            }

            // FULL FRAME SNAPSHOT (entire camera view with overlays)
            saveFullFrameCheatSnapshot();

            setTimeout(() => {
                examStatusText.style.color = "#475569";
                examCanvas.classList.remove("phone-alert-border");
            }, 2000);
        }

        const currentSus = Number(examSuspectDisplay.innerText) || 0;
        examSuspectDisplay.innerText = currentSus + 1;
    });
}

// FULL FRAME SNAPSHOT FUNCTION
function saveFullFrameCheatSnapshot() {
    const now = Date.now();
    if (now - lastCheatSnapshotTime < cheatSnapshotCooldown) {
        return; // avoid too many images
    }
    lastCheatSnapshotTime = now;

    const snapCanvas = document.createElement("canvas");
    const snapCtx = snapCanvas.getContext("2d");

    snapCanvas.width = examCanvas.width;
    snapCanvas.height = examCanvas.height;

    // capture entire current examCanvas (with bounding boxes)
    snapCtx.drawImage(examCanvas, 0, 0);

    snapCanvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        const ts = new Date();
        const timestamp = [
            ts.getFullYear(),
            String(ts.getMonth() + 1).padStart(2, "0"),
            String(ts.getDate()).padStart(2, "0")
        ].join("-") + "_" +
        String(ts.getHours()).padStart(2, "0") + "-" +
        String(ts.getMinutes()).padStart(2, "0") + "-" +
        String(ts.getSeconds()).padStart(2, "0");

        a.href = url;
        a.download = `CheatEvidence_FULL_${timestamp}.png`;
        a.click();

        console.log("📸 Full-frame cheat snapshot saved");
    });
}

// =====================
// EXAM REPORT (PDF)
// =====================
function generateExamReport() {
    if (timelineData.length === 0) {
        alert("No data recorded for this exam session.");
        return;
    }

    const doc  = new jsPDF();
    const date = new Date().toLocaleString();

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text("FOCUS AI - Exam Monitoring Report", 14, 20);

    doc.setFontSize(11);
    doc.setFont("Helvetica", "normal");
    doc.text(`Generated: ${date}`, 14, 28);
    doc.text("Summary:", 14, 36);

    const totalSnapshots = timelineData.length;
    const maxSuspects    = Math.max(...timelineData.map(d => d.suspects));
    const avgSuspects    = timelineData.reduce((a,b)=>a+b.suspects,0) / totalSnapshots;

    doc.text(`• Time monitored: ~${Math.round(totalSnapshots)} seconds`, 20, 44);
    doc.text(`• Max suspicious count: ${maxSuspects}`, 20, 50);
    doc.text(`• Avg suspicious count: ${avgSuspects.toFixed(2)}`, 20, 56);

    const rows = timelineData.map(d => [d.time, d.suspects]);

    doc.autoTable({
        startY: 64,
        head: [['Time', 'Suspicious Count']],
        body: rows,
        styles: { fontSize: 8 }
    });

    const filename = `FOCUSAI_Exam_Report_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(filename);
}

// =====================
// STUDENTS MANAGEMENT
// =====================
let students = [];
let activeStudent = null;

function addStudent(event) {
    event.preventDefault();
    const nameInput  = document.getElementById('studentName');
    const rollInput  = document.getElementById('studentRoll');
    const imageInput = document.getElementById('studentImage');

    const name = nameInput.value.trim();
    const roll = rollInput.value.trim();
    const file = imageInput.files[0];

    if (!name || !roll) {
        alert("Please enter both name and roll number.");
        return;
    }

    const handleAdd = (imageData) => {
        const student = {
            id: Date.now(),
            name,
            roll,
            image: imageData || null
        };
        students.push(student);
        renderStudentsList();
        document.getElementById('studentForm').reset();
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = () => handleAdd(reader.result);
        reader.readAsDataURL(file);
    } else {
        handleAdd(null);
    }
}

function renderStudentsList() {
    const container = document.getElementById('studentsList');
    const noMsg     = document.getElementById('noStudentsMessage');
    if (!container) return;

    container.innerHTML = '';

    if (students.length === 0) {
        if (noMsg) noMsg.style.display = 'block';
        return;
    } else {
        if (noMsg) noMsg.style.display = 'none';
    }

    students.forEach((s, index) => {
        const card = document.createElement('div');
        card.className = "border border-slate-200 rounded-xl bg-white px-3 py-2 flex gap-3 items-center";

        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = "w-12 h-12 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center text-xs text-slate-600";
        if (s.image) {
            const img = document.createElement('img');
            img.src = s.image;
            img.alt = s.name;
            img.className = "w-full h-full object-cover";
            avatarWrapper.appendChild(img);
        } else {
            avatarWrapper.textContent = "No Image";
        }

        const infoDiv = document.createElement('div');
        infoDiv.className = "flex-1";
        const nameEl = document.createElement('div');
        nameEl.className = "text-sm font-semibold text-slate-800";
        nameEl.textContent = s.name;
        const rollEl = document.createElement('div');
        rollEl.className = "text-[11px] text-slate-500";
        rollEl.textContent = "Roll No: " + s.roll;
        infoDiv.appendChild(nameEl);
        infoDiv.appendChild(rollEl);

        const btnDiv = document.createElement('div');
        btnDiv.className = "flex flex-col items-end gap-1";
        const setBtn = document.createElement('button');
        setBtn.type = "button";
        setBtn.className = "px-3 py-1 rounded-md bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-500";
        setBtn.textContent = "Set Active";
        setBtn.onclick = () => setActiveStudent(index);

        btnDiv.appendChild(setBtn);

        card.appendChild(avatarWrapper);
        card.appendChild(infoDiv);
        card.appendChild(btnDiv);

        container.appendChild(card);
    });

    updateActiveStudentUI();
}

function setActiveStudent(index) {
    activeStudent = students[index];
    updateActiveStudentUI();
    alert("Active student set to: " + activeStudent.name + " (Roll " + activeStudent.roll + ")");
}

function updateActiveStudentUI() {
    const name = activeStudent ? activeStudent.name : '--';
    const roll = activeStudent ? activeStudent.roll : '--';

    const nameLabel      = document.getElementById('activeStudentNameLabel');
    const rollLabel      = document.getElementById('activeStudentRollLabel');
    const examNameLabel  = document.getElementById('examActiveStudentNameLabel');
    const examRollLabel  = document.getElementById('examActiveStudentRollLabel');
    const studentsActiveDisplay = document.getElementById('studentsActiveDisplay');

    if (nameLabel) nameLabel.innerText         = "Student: " + name;
    if (rollLabel) rollLabel.innerText         = "Roll No: " + roll;
    if (examNameLabel) examNameLabel.innerText = "Student: " + name;
    if (examRollLabel) examRollLabel.innerText = "Roll No: " + roll;
    if (studentsActiveDisplay) {
        if (activeStudent) {
            studentsActiveDisplay.innerText = name + " (Roll " + roll + ")";
        } else {
            studentsActiveDisplay.innerText = "None selected";
        }
    }
}
