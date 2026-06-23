import { db, storage, collection, getDocs, query, where, doc, updateDoc, setDoc, serverTimestamp, ref, uploadString, getDownloadURL } from './firebase-config.js';

// DOM
const screenLogin = document.getElementById('screen-login');
const screenMain = document.getElementById('screen-main');
const keys = document.querySelectorAll('.key:not(.action-key)');
const btnClear = document.getElementById('btn-clear-pin');
const btnSubmit = document.getElementById('btn-submit-pin');
const pinDots = document.querySelectorAll('.pin-dot');
const loginStatus = document.getElementById('login-status');
const empNameDisplay = document.getElementById('emp-name-display');
const currentStatus = document.getElementById('current-status');
const lastRecordTime = document.getElementById('last-record-time');
const btnLogout = document.getElementById('btn-logout');
const btnEntrada = document.getElementById('btn-entrada');
const btnSalida = document.getElementById('btn-salida');
const locationStatus = document.getElementById('location-status');
const processingOverlay = document.getElementById('processing-overlay');
const processingText = document.getElementById('processing-text');
const selfieContainer = document.getElementById('selfie-container');
const selfieVideo = document.getElementById('selfie-video');
const selfieCanvas = document.getElementById('selfie-canvas');
const btnTakeSelfie = document.getElementById('btn-take-selfie');
const btnCancelSelfie = document.getElementById('btn-cancel-selfie');

const btnHorarios = document.getElementById('btn-horarios');
const modalHorarios = document.getElementById('modal-horarios');
const btnCerrarHorarios = document.getElementById('btn-cerrar-horarios');
const listaHorarios = document.getElementById('lista-horarios');

let currentPin = '';
let currentEmployee = null;
let isNativeAndroid = false;
let videoStream = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check if running as Capacitor Native Android
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        const info = await window.Capacitor.Plugins.Device.getInfo();
        if(info.platform === 'android') {
            isNativeAndroid = true;
        }
    }
    
    // Keypad Logic
    keys.forEach(k => {
        k.addEventListener('click', () => {
            if (currentPin.length < 6) {
                currentPin += k.getAttribute('data-val');
                updatePinDisplay();
            }
        });
    });
    
    btnClear.addEventListener('click', () => {
        currentPin = '';
        updatePinDisplay();
        loginStatus.textContent = '';
    });
    
    btnSubmit.addEventListener('click', loginWithPin);
    btnLogout.addEventListener('click', logout);
    
    btnEntrada.addEventListener('click', () => startAttendanceFlow('ENTRADA'));
    btnSalida.addEventListener('click', () => startAttendanceFlow('SALIDA'));
    btnCancelSelfie.addEventListener('click', closeSelfie);
    btnTakeSelfie.addEventListener('click', captureSelfieAndProceed);
    
    btnHorarios.addEventListener('click', loadHorariosEmpleado);
    btnCerrarHorarios.addEventListener('click', () => modalHorarios.style.display = 'none');
});

function updatePinDisplay() {
    pinDots.forEach((dot, index) => {
        if (index < currentPin.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
}

function getOrCreateDeviceId() {
    let devId = localStorage.getItem('parchesys_device_id');
    if (!devId) {
        devId = crypto.randomUUID();
        localStorage.setItem('parchesys_device_id', devId);
    }
    return devId;
}

function setProcessing(show, text="Procesando...") {
    processingText.textContent = text;
    processingOverlay.style.display = show ? 'flex' : 'none';
}

async function loginWithPin() {
    if (currentPin.length < 4) {
        loginStatus.textContent = "El PIN debe tener al menos 4 dígitos";
        return;
    }
    
    setProcessing(true, "Verificando PIN...");
    try {
        const q = query(collection(db, "empleados"), where("pin", "==", currentPin), where("estado", "==", "Activo"));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            loginStatus.textContent = "PIN incorrecto o usuario inactivo";
            setProcessing(false);
            return;
        }
        
        const empDoc = snap.docs[0];
        const empData = empDoc.data();
        const myDeviceId = getOrCreateDeviceId();
        
        // Device Check
        if (!empData.deviceId) {
            // Bind device
            await updateDoc(doc(db, "empleados", empDoc.id), {
                deviceId: myDeviceId,
                fechaVinculacion: new Date().toISOString()
            });
            empData.deviceId = myDeviceId;
        } else if (empData.deviceId !== myDeviceId) {
            loginStatus.textContent = "Este usuario ya posee un dispositivo registrado.";
            setProcessing(false);
            return;
        }
        
        currentEmployee = { id: empDoc.id, ...empData };
        showMainScreen();
    } catch (e) {
        console.error(e);
        loginStatus.textContent = "Error de conexión";
    }
    setProcessing(false);
}

function logout() {
    currentEmployee = null;
    currentPin = '';
    updatePinDisplay();
    screenMain.style.display = 'none';
    screenLogin.style.display = 'flex';
}

function showMainScreen() {
    screenLogin.style.display = 'none';
    screenMain.style.display = 'flex';
    empNameDisplay.textContent = currentEmployee.nombre;
    
    // Load last status (naive approach, fetch last doc)
    const ultimo = currentEmployee.ultimoMovimiento || "NINGUNO";
    currentStatus.textContent = ultimo;
    lastRecordTime.textContent = currentEmployee.ultimoRegistro || "--:--";

    // Disable buttons based on state
    if (ultimo === "ENTRADA") {
        btnEntrada.disabled = true;
        btnSalida.disabled = false;
        btnEntrada.style.opacity = '0.5';
        btnSalida.style.opacity = '1';
    } else {
        btnEntrada.disabled = false;
        btnSalida.disabled = true;
        btnEntrada.style.opacity = '1';
        btnSalida.style.opacity = '0.5';
    }
    
    if (currentEmployee.latitudBase) {
        locationStatus.innerHTML = `Ubicación Base Establecida <br> <small>(${currentEmployee.latitudBase.toFixed(4)}, ${currentEmployee.longitudBase.toFixed(4)})</small>`;
    } else {
        locationStatus.innerHTML = "Ubicación Base NO Establecida.<br>Se registrará en su primera marcación.";
    }
}

// ==========================================
// ATTENDANCE FLOW
// ==========================================
let pendingMovimiento = null;

async function startAttendanceFlow(tipo) {
    pendingMovimiento = tipo;
    
    // 1. Biometrics or Selfie
    if (isNativeAndroid && window.Capacitor.Plugins.NativeBiometric) {
        try {
            const Biometric = window.Capacitor.Plugins.NativeBiometric;
            const result = await Biometric.verifyIdentity({
                reason: `Autenticación requerida para ${tipo}`,
                title: "Validación Biométrica",
                subtitle: "Verifique su identidad"
            });
            // If successful
            processLocationAndSave(tipo, "Biometria Android", null);
        } catch (e) {
            alert("Autenticación biométrica fallida o cancelada.");
        }
    } else {
        // Web / iOS Flow -> Selfie
        openSelfie();
    }
}

async function openSelfie() {
    selfieContainer.style.display = 'flex';
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        selfieVideo.srcObject = videoStream;
    } catch (err) {
        alert("No se pudo acceder a la cámara. Se requiere para Web/iOS.");
        closeSelfie();
    }
}

function closeSelfie() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
    selfieContainer.style.display = 'none';
}

async function captureSelfieAndProceed() {
    const ctx = selfieCanvas.getContext('2d');
    selfieCanvas.width = selfieVideo.videoWidth;
    selfieCanvas.height = selfieVideo.videoHeight;
    ctx.drawImage(selfieVideo, 0, 0, selfieCanvas.width, selfieCanvas.height);
    const dataUrl = selfieCanvas.toDataURL('image/jpeg', 0.8);
    closeSelfie();
    
    setProcessing(true, "Subiendo selfie de seguridad...");
    try {
        const fileName = `selfies/${currentEmployee.id}_${Date.now()}.jpg`;
        const storageRef = ref(storage, fileName);
        await uploadString(storageRef, dataUrl, 'data_url');
        const urlSelfie = await getDownloadURL(storageRef);
        processLocationAndSave(pendingMovimiento, "Selfie", urlSelfie);
    } catch (e) {
        console.error(e);
        alert("Error subiendo selfie: " + e.message + " (" + e.code + "). Verifica que Firebase Storage esté activado y sus Reglas permitan lectura/escritura.");
        setProcessing(false);
    }
}

async function loadHorariosEmpleado() {
    listaHorarios.innerHTML = "<li>Cargando horarios...</li>";
    modalHorarios.style.display = 'flex';
    
    // Get monday of current week
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day == 0 ? -6: 1);
    const monday = new Date(now.setDate(diff));
    
    const mondayStr = monday.toISOString().split('T')[0];
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = sunday.toISOString().split('T')[0];
    
    try {
        const q = query(collection(db, "turnos"), where("emp_id", "==", currentEmployee.id), where("fecha", ">=", mondayStr), where("fecha", "<=", sundayStr));
        const snap = await getDocs(q);
        
        let turnos = [];
        snap.forEach(doc => turnos.push(doc.data()));
        
        // Sort by fecha
        turnos.sort((a,b) => a.fecha.localeCompare(b.fecha));
        
        if (turnos.length === 0) {
            listaHorarios.innerHTML = "<li>No tienes turnos asignados esta semana.</li>";
            return;
        }
        
        listaHorarios.innerHTML = "";
        const diasNombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        
        turnos.forEach(t => {
            const fd = new Date(t.fecha + "T12:00:00");
            const dName = diasNombres[fd.getDay() === 0 ? 6 : fd.getDay() - 1];
            
            const li = document.createElement('li');
            li.style.padding = "10px";
            li.style.borderBottom = "1px solid #ddd";
            li.innerHTML = `<strong>${dName} (${t.fecha}):</strong> <br> ${t.hora_in} - ${t.hora_out}`;
            listaHorarios.appendChild(li);
        });
        
    } catch(e) {
        console.error(e);
        listaHorarios.innerHTML = "<li>Error al cargar horarios.</li>";
    }
}

// ==========================================
// GEOLOCATION & SAVE
// ==========================================

function getGPSPosition(options) {
    return new Promise((resolve, reject) => {
        if(isNativeAndroid && window.Capacitor.Plugins.Geolocation) {
            window.Capacitor.Plugins.Geolocation.getCurrentPosition(options).then(resolve).catch(reject);
        } else {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        }
    });
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(dp/2) * Math.sin(dp/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function processLocationAndSave(tipoMovimiento, metodoValidacion, urlSelfie) {
    setProcessing(true, "Obteniendo GPS preciso...");
    
    try {
        const pos = await getGPSPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
        const { latitude, longitude, accuracy } = pos.coords;
        
        // Precisión GPS exigida (Móviles reales)
        const MAX_ACCURACY = 150;
        if (accuracy > MAX_ACCURACY) {
            alert(`Señal GPS débil. Precisión: ${Math.round(accuracy)}m. Requerido: <${MAX_ACCURACY}m. Muévase a un área despejada.`);
            setProcessing(false);
            return;
        }

        // Si no tiene ubicación base, registrarla ahora
        if (!currentEmployee.latitudBase) {
            setProcessing(true, "Configurando Ubicación Base (tomando muestras)...");
            // Simplified: we should ideally take 5 samples, but for UX in a single pass we just use this high accuracy one 
            // as base, or implement a quick loop. Let's do a loop.
            let sumLat = 0, sumLon = 0, sumAcc = 0;
            const SAMPLES = 5;
            for(let i=0; i<SAMPLES; i++) {
                const sp = await getGPSPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
                sumLat += sp.coords.latitude;
                sumLon += sp.coords.longitude;
                sumAcc += sp.coords.accuracy;
                await new Promise(r => setTimeout(r, 1000)); // wait 1s
            }
            const baseLat = sumLat / SAMPLES;
            const baseLon = sumLon / SAMPLES;
            const baseAcc = sumAcc / SAMPLES;

            await updateDoc(doc(db, "empleados", currentEmployee.id), {
                latitudBase: baseLat,
                longitudBase: baseLon,
                precisionPromedio: baseAcc
            });
            
            currentEmployee.latitudBase = baseLat;
            currentEmployee.longitudBase = baseLon;
            
            alert("Ubicación Base establecida exitosamente.");
        }

        // Validación de Distancia
        const dist = haversineDistance(currentEmployee.latitudBase, currentEmployee.longitudBase, latitude, longitude);
        
        // El radio fijo configurado es 150m
        const RADIO_PERMITIDO = 150; 
        
        if (dist > RADIO_PERMITIDO) {
            alert(`Fuera del área autorizada.\nDistancia actual: ${Math.round(dist)}m\nPermitida: ${RADIO_PERMITIDO}m`);
            setProcessing(false);
            return;
        }

        // GUARDAR REGISTRO UNIFICADO
        setProcessing(true, "Guardando registro...");
        
        const now = new Date();
        const strDate = now.toISOString().split('T')[0];
        const strTime = now.toTimeString().split(' ')[0];

        await setDoc(doc(collection(db, "asistencias")), {
            empleadoId: currentEmployee.id,
            nombreEmpleado: currentEmployee.nombre,
            tipoMovimiento: tipoMovimiento,
            fechaHora: serverTimestamp(),
            fecha: strDate,
            hora: strTime,
            deviceId: currentEmployee.deviceId,
            latitudActual: latitude,
            longitudActual: longitude,
            latitudBase: currentEmployee.latitudBase,
            longitudBase: currentEmployee.longitudBase,
            distanciaCalculada: Math.round(dist),
            precisionGPS: accuracy,
            metodoValidacion: metodoValidacion,
            urlSelfie: urlSelfie || null
        });

        // Actualizar último estado en Empleado
        await updateDoc(doc(db, "empleados", currentEmployee.id), {
            ultimoMovimiento: tipoMovimiento,
            ultimoRegistro: `${strDate} ${strTime}`
        });

        alert(`${tipoMovimiento} REGISTRADA CORRECTAMENTE`);
        logout();

    } catch (e) {
        console.error(e);
        if(e.code === 1 || e.message.includes('User denied')) {
            alert("Debe conceder permisos de ubicación GPS.");
        } else {
            alert("Error procesando GPS o guardando. Reintente.");
        }
    }
    setProcessing(false);
}
