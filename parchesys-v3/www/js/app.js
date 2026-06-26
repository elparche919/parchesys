import { db, storage, collection, getDocs, query, where, orderBy, limit, doc, updateDoc, setDoc, serverTimestamp, ref, uploadString, getDownloadURL } from './firebase-config.js';

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
        devId = (crypto.randomUUID && typeof crypto.randomUUID === 'function') 
            ? crypto.randomUUID() 
            : 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
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
        const q = query(collection(db, "turnos"), where("emp_id", "==", currentEmployee.id));
        const snap = await getDocs(q);
        
        let turnos = [];
        snap.forEach(doc => {
            const t = doc.data();
            // Filter by date manually in JS to avoid requiring a composite index in Firestore
            if (t.fecha >= mondayStr && t.fecha <= sundayStr) {
                turnos.push(t);
            }
        });
        
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
    return new Promise(async (resolve, reject) => {
        if(isNativeAndroid && window.Capacitor.Plugins.Geolocation) {
            try {
                // Check and request permissions first
                const check = await window.Capacitor.Plugins.Geolocation.checkPermissions();
                if (check.location !== 'granted') {
                    const req = await window.Capacitor.Plugins.Geolocation.requestPermissions();
                    if (req.location !== 'granted') {
                        return reject(new Error("User denied Geolocation permission."));
                    }
                }
                const pos = await window.Capacitor.Plugins.Geolocation.getCurrentPosition(options);
                resolve(pos);
            } catch(e) {
                reject(e);
            }
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
    setProcessing(true, "Iniciando registro...");
    
    let latitude = 0;
    let longitude = 0;
    let accuracy = 9999;
    let dist = 0;
    let notas = "";

    try {
        setProcessing(true, "Obteniendo GPS...");
        const pos = await getGPSPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        accuracy = pos.coords.accuracy;
        
        // Precisión GPS exigida (Móviles reales)
        const MAX_ACCURACY = 150;
        if (accuracy > MAX_ACCURACY) {
            notas += `Señal GPS débil (${Math.round(accuracy)}m). `;
            alert(`Señal GPS débil. Precisión: ${Math.round(accuracy)}m. Requerido: <${MAX_ACCURACY}m. El registro se guardará con advertencia.`);
        }

        // Si no tiene ubicación base, registrarla ahora solo si la precisión es buena
        if (!currentEmployee.latitudBase && accuracy <= MAX_ACCURACY) {
            setProcessing(true, "Configurando Ubicación Base (tomando muestras)...");
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
        if (currentEmployee.latitudBase) {
            dist = haversineDistance(currentEmployee.latitudBase, currentEmployee.longitudBase, latitude, longitude);
            
            // El radio fijo configurado es 150m
            const RADIO_PERMITIDO = 150; 
            
            if (dist > RADIO_PERMITIDO) {
                notas += `Fuera del área autorizada (${Math.round(dist)}m). `;
                alert(`Fuera del área autorizada.\nDistancia actual: ${Math.round(dist)}m\nPermitida: ${RADIO_PERMITIDO}m. El registro se guardará con advertencia.`);
            }
        }

    } catch (e) {
        console.error("Error GPS: ", e);
        notas += "Error o permisos de GPS denegados. ";
        alert("No se pudo obtener su ubicación GPS. El registro se guardará pero debe reportarlo al administrador.");
    }

    try {
        // GUARDAR REGISTRO UNIFICADO SIEMPRE
        setProcessing(true, "Guardando registro...");
        
        const now = new Date();
        let strDate = now.toISOString().split('T')[0];
        const strTime = now.toTimeString().split(' ')[0];

        // LOGICA DE REINICIO DE TURNO (Evita huérfanos el día siguiente)
        if (tipoMovimiento === 'SALIDA') {
            const qLast = query(collection(db, "asistencias"), 
                where("empleadoId", "==", currentEmployee.id),
                where("tipoMovimiento", "==", "ENTRADA")
            );
            const snapLast = await getDocs(qLast);
            if (!snapLast.empty) {
                // Filtrar y ordenar en memoria para evitar errores de índice compuesto en Firestore
                let entradas = [];
                snapLast.forEach(doc => entradas.push(doc.data()));
                entradas.sort((a, b) => {
                    const tA = a.fechaHora?.toDate ? a.fechaHora.toDate().getTime() : (a.fechaHora?.seconds ? a.fechaHora.seconds * 1000 : new Date(`${a.fecha}T${a.hora}`).getTime());
                    const tB = b.fechaHora?.toDate ? b.fechaHora.toDate().getTime() : (b.fechaHora?.seconds ? b.fechaHora.seconds * 1000 : new Date(`${b.fecha}T${b.hora}`).getTime());
                    return tB - tA; // Descending
                });

                const lastEntrada = entradas[0];
                // Validar que la entrada fue hace menos de 24 horas
                let entTime;
                if (lastEntrada.fechaHora && lastEntrada.fechaHora.toDate) {
                    entTime = lastEntrada.fechaHora.toDate();
                } else if (lastEntrada.fechaHora && lastEntrada.fechaHora.seconds) {
                    entTime = new Date(lastEntrada.fechaHora.seconds * 1000);
                } else {
                    entTime = new Date(`${lastEntrada.fecha}T${lastEntrada.hora}`);
                }
                
                const diffHours = (now - entTime) / (1000 * 60 * 60);
                if (diffHours < 24) {
                    strDate = lastEntrada.fecha; // Heredamos fecha de ENTRADA para unificar el ciclo del turno
                }
            }
        }

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
            latitudBase: currentEmployee.latitudBase || null,
            longitudBase: currentEmployee.longitudBase || null,
            distanciaCalculada: Math.round(dist),
            precisionGPS: accuracy,
            metodoValidacion: metodoValidacion,
            urlSelfie: urlSelfie || null,
            notas: notas
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
        alert("Error crítico al guardar: " + (e.message || JSON.stringify(e)));
    }
    setProcessing(false);
}
