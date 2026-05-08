const $ = (id) => document.getElementById(id);

const state = {
  mode: "pushup",
  running: false,
  reps: 0,
  seconds: 0,
  timer: null,
  stream: null,
  poseLandmarker: null,
  lastVideoTime: -1,
  repPhase: "up",
  plankWarned: false,
  llmEngine: null,
  llmReady: false,
  progress: loadProgress()
};

const coachFallbacks = {
  start: [
    "Let’s forge this. Smooth reps, steady breathing, no rushing.",
    "You do not need heroic effort. You need one clean rep at a time.",
    "Start controlled. Your job is consistency, not perfection."
  ],
  pushup: [
    "Strong work. Keep your body tight and finish the next rep clean.",
    "Breathe. Lower under control. Press the floor away.",
    "You are building proof. One more quality rep."
  ],
  plank: [
    "Hold steady. Ribs down, glutes tight, breathe through it.",
    "You can do this. The discomfort is temporary; the adaptation is earned.",
    "Brace gently and stay long from shoulders to heels."
  ],
  treadmill: [
    "Stay relaxed. Shoulders loose, steps light, breathing calm.",
    "Good rhythm. Keep the pace sustainable and controlled.",
    "This is cardio equity. You are investing in your future energy."
  ]
};

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem("bodyForgeProgress")) || { week: 1, streak: 0, history: [], lastComplete: "" };
  } catch {
    return { week: 1, streak: 0, history: [], lastComplete: "" };
  }
}

function saveProgress() {
  localStorage.setItem("bodyForgeProgress", JSON.stringify(state.progress));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function pushupTarget() {
  return 10 + Math.max(0, state.progress.week - 1) * 5;
}

function renderProgress() {
  $("weekNumber").textContent = state.progress.week;
  $("pushupTarget").textContent = pushupTarget();
  $("streak").textContent = state.progress.streak || 0;
  $("todayPlan").textContent = `Week ${state.progress.week} target: ${pushupTarget()} pushups/day for 5 days. Add planks and treadmill work as tolerated.`;
  const history = state.progress.history.slice(-12).reverse();
  $("historyList").innerHTML = history.length
    ? history.map(h => `<div class="history-item"><div><strong>${h.mode}</strong><br><span>${h.note || "Session completed"}</span></div><time>${h.date}</time></div>`).join("")
    : `<p>No sessions logged yet. Start small and forge the streak.</p>`;
}

function setMessage(message, speak = true) {
  $("coachMessage").textContent = message;
  if (speak && $("voiceToggle").checked && "speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}

function randomCoach(kind) {
  const arr = coachFallbacks[kind] || coachFallbacks.start;
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function updateSessionUI() {
  $("primaryMetric").textContent = state.mode === "pushup" ? state.reps : formatTime(state.seconds);
  $("primaryLabel").textContent = state.mode === "pushup" ? "reps" : state.mode === "plank" ? "plank hold" : "cardio time";
  $("timerMetric").textContent = formatTime(state.seconds);
  $("modeTitle").textContent = state.mode === "pushup" ? "Pushup Coach" : state.mode === "plank" ? "Plank Coach" : "Treadmill Coach";
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
  state.reps = 0;
  state.seconds = 0;
  state.repPhase = "up";
  updateSessionUI();
  setMessage(mode === "pushup" ? "Pushup mode ready. I can count reps with the camera or you can tap manual rep." :
             mode === "plank" ? "Plank mode ready. I’ll encourage you through the hold." :
             "Treadmill mode ready. I’ll guide your intervals and keep you moving.", false);
}

async function startSession() {
  if (state.running) return;
  state.running = true;
  state.reps = 0;
  state.seconds = 0;
  state.repPhase = "up";
  updateSessionUI();
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;
  setMessage(randomCoach("start"));

  state.timer = setInterval(() => {
    state.seconds++;
    updateSessionUI();
    if (state.mode === "plank" && state.seconds > 0 && state.seconds % 15 === 0) setMessage(randomCoach("plank"));
    if (state.mode === "treadmill" && state.seconds > 0 && state.seconds % 30 === 0) setMessage(randomCoach("treadmill"));
  }, 1000);

  if ($("cameraToggle").checked && state.mode !== "treadmill") {
    await startCameraAndPose();
  }
}

function stopSession() {
  state.running = false;
  clearInterval(state.timer);
  $("startBtn").disabled = false;
  $("stopBtn").disabled = true;
  stopCamera();
  setMessage("Session paused. Good work listening to your body.");
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  $("cameraStatus").textContent = "Camera idle";
}

async function startCameraAndPose() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    $("video").srcObject = state.stream;
    await $("video").play();
    $("cameraStatus").textContent = "Loading pose tracker...";
    await initPose();
    requestAnimationFrame(poseLoop);
  } catch (err) {
    $("cameraStatus").textContent = "Camera unavailable";
    setMessage("Camera tracking is unavailable, so I’ll use manual/timer coaching for this session.");
    console.warn(err);
  }
}

async function initPose() {
  if (state.poseLandmarker) return;
  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs");
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
  );
  state.poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
  $("cameraStatus").textContent = "Pose tracking active";
}

function poseLoop() {
  if (!state.running || !state.poseLandmarker || !$("video").videoWidth) return;
  const video = $("video");
  const canvas = $("overlay");
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (video.currentTime !== state.lastVideoTime) {
    state.lastVideoTime = video.currentTime;
    const result = state.poseLandmarker.detectForVideo(video, performance.now());
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (result.landmarks && result.landmarks[0]) {
      drawLandmarks(ctx, result.landmarks[0], canvas);
      analyzePose(result.landmarks[0]);
    }
  }
  requestAnimationFrame(poseLoop);
}

function drawLandmarks(ctx, lm, canvas) {
  ctx.fillStyle = "rgba(251,191,36,.95)";
  for (const p of lm) {
    if ((p.visibility ?? 1) < .45) continue;
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function analyzePose(lm) {
  // MediaPipe Pose landmarks: shoulders 11/12, elbows 13/14, wrists 15/16, hips 23/24.
  const shoulder = avg(lm[11], lm[12]);
  const elbow = avg(lm[13], lm[14]);
  const wrist = avg(lm[15], lm[16]);
  const hip = avg(lm[23], lm[24]);

  if (state.mode === "pushup") {
    const elbowAngle = angle(shoulder, elbow, wrist);
    if (elbowAngle < 95 && state.repPhase === "up") state.repPhase = "down";
    if (elbowAngle > 145 && state.repPhase === "down") {
      state.repPhase = "up";
      incrementRep();
    }
    $("cameraStatus").textContent = `Tracking pushup form • elbow ${Math.round(elbowAngle)}°`;
  }

  if (state.mode === "plank") {
    const bodySlope = Math.abs(shoulder.y - hip.y);
    if (bodySlope > 0.16 && !state.plankWarned) {
      state.plankWarned = true;
      setMessage("Check your plank line. Keep shoulders, hips, and heels as level as you comfortably can.");
      setTimeout(() => state.plankWarned = false, 9000);
    }
    $("cameraStatus").textContent = "Tracking plank posture";
  }
}

function avg(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
}

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag1 = Math.hypot(ab.x, ab.y);
  const mag2 = Math.hypot(cb.x, cb.y);
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * 180 / Math.PI;
}

function incrementRep() {
  state.reps++;
  updateSessionUI();
  const target = pushupTarget();
  if (state.reps === target) setMessage(`Target reached: ${target}. Excellent work. You forged today’s strength.`);
  else if (state.reps % 3 === 0 || target - state.reps <= 3) setMessage(`${state.reps} complete. ${Math.max(0, target - state.reps)} to target. ${randomCoach("pushup")}`);
}

function completeSession() {
  const date = todayKey();
  const note = state.mode === "pushup" ? `${state.reps} reps` : `${formatTime(state.seconds)}`;
  state.progress.history.push({ date, mode: state.mode, note });
  if (state.progress.lastComplete !== date) {
    state.progress.streak = (state.progress.streak || 0) + 1;
    state.progress.lastComplete = date;
  }
  const recentPushupDays = state.progress.history.filter(h => h.mode === "pushup").slice(-5);
  if (recentPushupDays.length >= 5 && recentPushupDays.every(h => parseInt(h.note) >= pushupTarget())) {
    state.progress.week++;
    setMessage(`Five pushup days complete. Next week’s forge target rises to ${pushupTarget()} pushups.`);
  } else {
    setMessage("Logged. You kept the promise today.");
  }
  saveProgress();
  renderProgress();
}

async function initWebLLM() {
  if (!$("webllmToggle").checked || state.llmReady) return;
  try {
    $("llmStatus").textContent = "Local AI: loading WebLLM...";
    const webllm = await import("https://esm.run/@mlc-ai/web-llm");
    state.llmEngine = new webllm.MLCEngine();
    await state.llmEngine.reload("Llama-3.2-1B-Instruct-q4f16_1-MLC", {
      initProgressCallback: (p) => {
        $("llmStatus").textContent = `Local AI: ${p.text || "loading model..."}`;
      }
    });
    state.llmReady = true;
    $("llmStatus").textContent = "Local AI: ready";
  } catch (err) {
    console.warn(err);
    $("llmStatus").textContent = "Local AI: unavailable; using built-in coach";
    $("webllmToggle").checked = false;
  }
}

async function coachUser(text) {
  await initWebLLM();
  const context = `Mode: ${state.mode}. Reps: ${state.reps}. Time: ${formatTime(state.seconds)}. Target pushups: ${pushupTarget()}. User says: ${text}`;
  if (state.llmReady) {
    try {
      const reply = await state.llmEngine.chat.completions.create({
        messages: [
          { role: "system", content: "You are Body Forge AI, a concise, supportive fitness motivator. Give safe, encouraging, non-medical coaching in 1-2 sentences. Remind the user to stop for pain, dizziness, chest discomfort, or unusual shortness of breath when appropriate." },
          { role: "user", content: context }
        ],
        temperature: 0.7,
        max_tokens: 80
      });
      setMessage(reply.choices?.[0]?.message?.content || randomCoach(state.mode));
      return;
    } catch (err) {
      console.warn(err);
    }
  }
  setMessage(`${randomCoach(state.mode)} You said: “${text}”`);
}

function startListening() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    setMessage("Speech recognition is not available in this browser. You can type how you feel instead.");
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    $("userNote").value = text;
    coachUser(text);
  };
  recognition.start();
}

function setupInstall() {
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBtn").classList.remove("hidden");
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("installBtn").classList.add("hidden");
  });
}

document.querySelectorAll(".mode").forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
$("startBtn").addEventListener("click", startSession);
$("stopBtn").addEventListener("click", stopSession);
$("resetBtn").addEventListener("click", () => { state.reps = 0; state.seconds = 0; updateSessionUI(); });
$("manualRepBtn").addEventListener("click", incrementRep);
$("completeBtn").addEventListener("click", completeSession);
$("sendNoteBtn").addEventListener("click", () => coachUser($("userNote").value || "I need encouragement."));
$("listenBtn").addEventListener("click", startListening);
$("webllmToggle").addEventListener("change", initWebLLM);
$("clearHistoryBtn").addEventListener("click", () => {
  if (!confirm("Clear all Body Forge AI history?")) return;
  state.progress = { week: 1, streak: 0, history: [], lastComplete: "" };
  saveProgress();
  renderProgress();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(console.warn);
}

setupInstall();
renderProgress();
updateSessionUI();
