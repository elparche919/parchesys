import { app, db, auth, collection, getDocs, query, where, orderBy, doc, setDoc, updateDoc, serverTimestamp, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, limit } from './firebase-config.js';

// DOM Elements
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const adminEmail = document.getElementById('admin-email');
const adminPassword = document.getElementById('admin-password');
const btnLogin = document.getElementById('btn-admin-login');
const loginError = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-admin-logout');

// Navigation
const navLinks = document.querySelectorAll('.nav-links li');
const viewSections = document.querySelectorAll('.view-section');
const viewTitle = document.getElementById('view-title');

// Stats
const statEmpleados = document.getElementById('stat-empleados');
const statAsistencias = document.getElementById('stat-asistencias');
const statDispositivos = document.getElementById('stat-dispositivos');

// Modals
const modalEmpleado = document.getElementById('modal-empleado');
const btnCrearEmpleado = document.getElementById('btn-crear-empleado');
const btnCancelarEmpleado = document.getElementById('btn-cancelar-empleado');
const btnGuardarEmpleado = document.getElementById('btn-guardar-empleado');
const empNombre = document.getElementById('emp-nombre');
const empPin = document.getElementById('emp-pin');

// Tables
const tablaEmpleados = document.getElementById('tabla-empleados');
const tablaAsistencias = document.getElementById('tabla-asistencias');
const tablaDispositivos = document.getElementById('tabla-dispositivos');
const tablaAuditoria = document.getElementById('tabla-auditoria');

// Check Auth State
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Assume all logged-in users here are admins for now.
        // In a real app, check role in 'usuarios' collection
        loginContainer.style.display = 'none';
        dashboardContainer.style.display = 'flex';
        loadDashboardData();
    } else {
        loginContainer.style.display = 'flex';
        dashboardContainer.style.display = 'none';
    }
});

// Login
btnLogin.addEventListener('click', async () => {
    try {
        await signInWithEmailAndPassword(auth, adminEmail.value, adminPassword.value);
        loginError.style.display = 'none';
    } catch (error) {
        // AUTO-CREATION OF INITIAL ADMIN
        if (adminEmail.value === 'cast152025@gmail.com') {
            try {
                await createUserWithEmailAndPassword(auth, adminEmail.value, adminPassword.value);
                loginError.style.display = 'none';
                return;
            } catch (e) {
                loginError.innerHTML = `Error creando administrador inicial:<br>${e.message} (${e.code})`;
                loginError.style.display = 'block';
                return;
            }
        }
        
        loginError.innerHTML = `Error de acceso:<br>${error.message} (${error.code})`;
        loginError.style.display = 'block';
    }
});

// Logout
btnLogout.addEventListener('click', async () => {
    await signOut(auth);
});

// Navigation Logic
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        const view = link.getAttribute('data-view');
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        viewSections.forEach(sec => sec.classList.remove('active'));
        document.getElementById(`view-${view}`).classList.add('active');
        viewSections.forEach(sec => sec.style.display = 'none');
        document.getElementById(`view-${view}`).style.display = 'block';
        
        viewTitle.textContent = link.textContent;
        
        // Load data based on view
        if(view === 'empleados') loadEmpleados();
        if(view === 'asistencias') loadAsistencias();
        if(view === 'dispositivos') loadDispositivos();
        if(view === 'auditoria') loadAuditoria();
    });
});

// --- API Functions ---

async function auditoria(accion, detalle) {
    await setDoc(doc(collection(db, "auditoria")), {
        fechaHora: serverTimestamp(),
        accion: accion,
        detalle: detalle,
        usuario: auth.currentUser.email
    });
}

// Load Dashboard Basic Data
async function loadDashboardData() {
    // Just a quick count, ideally use aggregation queries in production
    const empSnap = await getDocs(collection(db, "empleados"));
    statEmpleados.textContent = empSnap.size;
    
    // Asistencias today
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const qAsist = query(collection(db, "asistencias"), where("fecha", ">=", startOfDay.toISOString().split('T')[0]));
    const asisSnap = await getDocs(qAsist);
    statAsistencias.textContent = asisSnap.size;
    
    // Dispositivos bound (where deviceId != null)
    let boundCount = 0;
    empSnap.forEach(d => { if(d.data().deviceId) boundCount++; });
    statDispositivos.textContent = boundCount;
}

// Empleados
async function loadEmpleados() {
    try {
        const q = query(collection(db, "empleados"), orderBy("nombre"));
        const snap = await getDocs(q);
        tablaEmpleados.innerHTML = '';
        
        snap.forEach(doc => {
            const d = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${d.nombre}</td>
                <td>${d.pin}</td>
                <td><span class="badge ${d.estado === 'Activo' ? 'badge-success' : 'badge-danger'}">${d.estado}</span></td>
                <td>${d.deviceId ? 'Vinculado' : 'Sin Vincular'}</td>
                <td>${d.ultimoRegistro || 'Nunca'}</td>
                <td>
                    <button class="btn-secondary" onclick="window.resetDevice('${doc.id}', '${d.nombre}')">Reset Dispositivo</button>
                    <button class="btn-secondary" onclick="window.resetGPS('${doc.id}', '${d.nombre}')">Reset GPS</button>
                </td>
            `;
            tablaEmpleados.appendChild(tr);
        });
    } catch(err) {
        console.error(err);
        tablaEmpleados.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error de Base de Datos: ${err.message}. Â¿Tienes habilitado Firestore y configuradas las Reglas de Seguridad?</td></tr>`;
    }
}

window.resetDevice = async (id, nombre) => {
    if(confirm(`Â¿Desvincular dispositivo de ${nombre}?`)) {
        await updateDoc(doc(db, "empleados", id), { deviceId: null });
        await auditoria('DESVINCULAR_DISPOSITIVO', `Empleado: ${nombre}`);
        loadEmpleados();
    }
};

window.resetGPS = async (id, nombre) => {
    if(confirm(`Â¿Borrar ubicaciÃ³n base de ${nombre}?`)) {
        await updateDoc(doc(db, "empleados", id), { latitudBase: null, longitudBase: null });
        await auditoria('RESET_GPS', `Empleado: ${nombre}`);
        loadEmpleados();
    }
};

// Crear Empleado
btnCrearEmpleado.addEventListener('click', () => {
    empNombre.value = '';
    empPin.value = '';
    modalEmpleado.style.display = 'flex';
});
btnCancelarEmpleado.addEventListener('click', () => modalEmpleado.style.display = 'none');

btnGuardarEmpleado.addEventListener('click', async () => {
    const nom = empNombre.value.trim();
    const pin = empPin.value.trim();
    const sal = Number(document.getElementById('emp-salario').value) || 0;
    const vext = Number(document.getElementById('emp-valor-extra').value) || 0;
    const aley = document.getElementById('emp-aplica-ley').checked;

    if(nom && pin.length >= 4) {
        try {
            await setDoc(doc(collection(db, "empleados")), {
                nombre: nom,
                pin: pin,
                salarioBase: sal,
                valorHoraExtra: vext,
                aplicaLey: aley,
                estado: 'Activo',
                deviceId: null,
                fechaCreacion: serverTimestamp()
            });
            await auditoria('CREAR_EMPLEADO', `Nombre: ${nom}`);
            modalEmpleado.style.display = 'none';
            loadEmpleados();
        } catch(e) {
            console.error(e);
            alert("Error al guardar en base de datos: " + e.message + ". Verifica las Reglas de Firestore.");
        }
    } else {
        alert("Ingrese nombre y un PIN de al menos 4 dÃ­gitos");
    }
});

// Asistencias
async function loadAsistencias() {
    const q = query(collection(db, "asistencias"), orderBy("fechaHora", "desc"), limit(50));
    const snap = await getDocs(q);
    tablaAsistencias.innerHTML = '';
    
    snap.forEach(doc => {
        const d = doc.data();
        const dateStr = d.fechaHora && d.fechaHora.toDate ? d.fechaHora.toDate().toLocaleString() : d.fechaHora;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.nombreEmpleado}</td>
            <td><span class="badge ${d.tipoMovimiento === 'ENTRADA' ? 'badge-success' : 'badge-danger'}">${d.tipoMovimiento}</span></td>
            <td>${dateStr}</td>
            <td>${d.metodoValidacion} ${d.urlSelfie ? '<a href="'+d.urlSelfie+'" target="_blank">[Ver Selfie]</a>' : ''}</td>
            <td>${d.latitudActual?.toFixed(4)}, ${d.longitudActual?.toFixed(4)}</td>
            <td>${d.distanciaCalculada ? d.distanciaCalculada + 'm' : '-'}</td>
        `;
        tablaAsistencias.appendChild(tr);
    });
}

// Dispositivos (Same as empleados basically, focused on device info)
async function loadDispositivos() {
    const q = query(collection(db, "empleados"), where("deviceId", "!=", null));
    const snap = await getDocs(q);
    tablaDispositivos.innerHTML = '';
    
    snap.forEach(doc => {
        const d = doc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.nombre}</td>
            <td>${d.deviceId}</td>
            <td>${d.modeloDispositivo || 'N/A'}</td>
            <td>${d.sistemaOperativo || 'N/A'}</td>
            <td>${d.fechaVinculacion || '-'}</td>
            <td>
                 <button class="btn-danger" onclick="window.resetDevice('${doc.id}', '${d.nombre}')">Desvincular</button>
            </td>
        `;
        tablaDispositivos.appendChild(tr);
    });
}

// AuditorÃ­a
async function loadAuditoria() {
    const q = query(collection(db, "auditoria"), orderBy("fechaHora", "desc"), limit(50));
    const snap = await getDocs(q);
    tablaAuditoria.innerHTML = '';
    
    snap.forEach(doc => {
        const d = doc.data();
        const dateStr = d.fechaHora && d.fechaHora.toDate ? d.fechaHora.toDate().toLocaleString() : d.fechaHora;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${d.accion}</td>
            <td>${d.detalle}</td>
            <td>${d.usuario}</td>
        `;
        tablaAuditoria.appendChild(tr);
    });
}


document.getElementById('btn-import-v2')?.addEventListener('click', async () => {
    if(!confirm('¿Estás seguro de querer importar los empleados desde la base de datos antigua (v2)?')) return;
    
    try {
        const btn = document.getElementById('btn-import-v2');
        btn.disabled = true;
        btn.textContent = 'Importando...';
        const res = await fetch('https://parche-sys-v2-default-rtdb.firebaseio.com/negocios/elparche/empleados.json');
        const data = await res.json();
        
        if(!data) {
            alert('No se encontraron empleados en la v2.');
            btn.disabled = false; btn.textContent = 'Importar Empleados de v2';
            return;
        }
        
        let count = 0;
        for(let key in data) {
            const emp = data[key];
            if(emp.nombre && emp.pin) {
                await setDoc(doc(collection(db, "empleados")), {
                    nombre: emp.nombre,
                    pin: emp.pin,
                    estado: emp.activo === false ? 'Inactivo' : 'Activo',
                    deviceId: null,
                    fechaCreacion: serverTimestamp()
                });
                count++;
            }
        }
        
        alert("¡Éxito! Se importaron " + count + " empleados de la versión anterior.");
        loadEmpleados();
        btn.style.display = 'none'; // Hide button after import
        
    } catch(err) {
        console.error(err);
        alert('Error al importar: ' + err.message);
        document.getElementById('btn-import-v2').disabled = false;
        document.getElementById('btn-import-v2').textContent = 'Importar Empleados de v2';
    }
});
