import { app, db, auth, collection, getDocs, query, where, orderBy, doc, setDoc, updateDoc, serverTimestamp, deleteDoc, limit } from './firebase-config.js';

// DOM Elements
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const adminPin = document.getElementById('admin-pin');
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

// Check Session State
function checkSession() {
    if (sessionStorage.getItem('parchesys_admin_auth') === 'true') {
        loginContainer.style.display = 'none';
        dashboardContainer.style.display = 'flex';
        loadDashboardData();
    } else {
        loginContainer.style.display = 'flex';
        dashboardContainer.style.display = 'none';
    }
}
checkSession();

// Login
btnLogin.addEventListener('click', () => {
    const pin = adminPin.value;
    if (pin === '1919') {
        sessionStorage.setItem('parchesys_admin_auth', 'true');
        loginError.style.display = 'none';
        checkSession();
    } else {
        loginError.innerHTML = `PIN Incorrecto`;
        loginError.style.display = 'block';
    }
});

// Logout
btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('parchesys_admin_auth');
    adminPin.value = '';
    checkSession();
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
    try {
        await setDoc(doc(collection(db, "auditoria")), {
            fechaHora: serverTimestamp(),
            accion: accion,
            detalle: detalle,
            usuario: 'ADMIN (PIN)'
        });
    } catch(e) {
        console.error("Auditoria error", e);
    }
}

// Load Dashboard Basic Data
async function loadDashboardData() {
    // Just a quick count, ideally use aggregation queries in production
    const empSnap = await getDocs(collection(db, "empleados"));
    statEmpleados.textContent = empSnap.size;
    
    // Asistencias today
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const localDateStr = `${startOfDay.getFullYear()}-${String(startOfDay.getMonth()+1).padStart(2,'0')}-${String(startOfDay.getDate()).padStart(2,'0')}`;
    const qAsist = query(collection(db, "asistencias"), where("fecha", ">=", localDateStr));
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
                // Escape simple quotes for inline onclick parameters
                const safeNombre = d.nombre.replace(/'/g, "\\'");
                const dui = d.dui || '';
                const tel = d.telefono || '';
                const sal = d.salarioBase || 0;
                const vext = d.valorHoraExtra || 0;
                const ley = d.aplicaLey ? 'true' : 'false';

                tr.innerHTML = `
                    <td>${d.nombre}</td>
                    <td>${d.pin}</td>
                    <td><span class="badge ${d.estado === 'Activo' ? 'badge-success' : 'badge-danger'}">${d.estado}</span></td>
                    <td>${d.deviceId ? 'Vinculado' : 'Sin Vincular'}</td>
                    <td>${d.ultimoRegistro || 'Nunca'}</td>
                    <td>
                        <button class="btn-secondary" onclick="window.editarEmpleado('${doc.id}', '${safeNombre}', '${d.pin}', '${tel}', '${dui}', ${sal}, ${vext}, ${ley})">✏️ Editar</button>
                        <button class="btn-secondary" onclick="window.resetDevice('${doc.id}', '${safeNombre}')">📱 Reset</button>
                        <button class="btn-secondary" onclick="window.eliminarEmpleado('${doc.id}', '${safeNombre}')" style="color: red;">🗑️ Eliminar</button>
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
window.eliminarEmpleado = async (id, nombre) => {
    if(confirm(`¿Estás SEGURO de eliminar al empleado ${nombre}? Esto borrará su perfil del sistema.`)) {
        try {
            await deleteDoc(doc(db, "empleados", id));
            alert("Empleado eliminado.");
            loadEmpleados();
        } catch(e) {
            console.error(e);
            alert("Error al eliminar: " + e.message);
        }
    }
}

window.editarEmpleado = (id, nombre, pin, telefono, dui, salario, valorExtra, aplicaLey) => {
    document.getElementById('modal-empleado-title').textContent = "Editar Empleado";
    document.getElementById('emp-id').value = id;
    document.getElementById('emp-nombre').value = nombre;
    document.getElementById('emp-pin').value = pin;
    document.getElementById('emp-telefono').value = telefono;
    document.getElementById('emp-dui').value = dui;
    document.getElementById('emp-salario').value = salario;
    document.getElementById('emp-valor-extra').value = valorExtra;
    document.getElementById('emp-aplica-ley').checked = (aplicaLey === true || aplicaLey === 'true');
    modalEmpleado.style.display = 'flex';
}

btnCrearEmpleado.addEventListener('click', () => {
    document.getElementById('modal-empleado-title').textContent = "Nuevo Empleado";
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-nombre').value = '';
    document.getElementById('emp-pin').value = '';
    document.getElementById('emp-telefono').value = '';
    document.getElementById('emp-dui').value = '';
    document.getElementById('emp-salario').value = '';
    document.getElementById('emp-valor-extra').value = '';
    document.getElementById('emp-aplica-ley').checked = false;
    modalEmpleado.style.display = 'flex';
});

btnCancelarEmpleado.addEventListener('click', () => {
    modalEmpleado.style.display = 'none';
});

btnGuardarEmpleado.addEventListener('click', async () => {
    const empId = document.getElementById('emp-id').value;
    const nom = empNombre.value.trim();
    const pin = empPin.value.trim();
    const tel = document.getElementById('emp-telefono').value.trim();
    const dui = document.getElementById('emp-dui').value.trim();
    const sal = Number(document.getElementById('emp-salario').value) || 0;
    const vext = Number(document.getElementById('emp-valor-extra').value) || 0;
    const aley = document.getElementById('emp-aplica-ley').checked;

    if(nom && pin.length >= 4) {
        try {
            if (empId) {
                // Modo Edición
                await updateDoc(doc(db, "empleados", empId), {
                    nombre: nom,
                    pin: pin,
                    telefono: tel,
                    dui: dui,
                    salarioBase: sal,
                    valorHoraExtra: vext,
                    aplicaLey: aley
                });
                alert("Empleado actualizado correctamente.");
            } else {
                // Modo Creación
                await setDoc(doc(collection(db, "empleados")), {
                    nombre: nom,
                    pin: pin,
                    telefono: tel,
                    dui: dui,
                    salarioBase: sal,
                    valorHoraExtra: vext,
                    aplicaLey: aley,
                    estado: 'Activo',
                    deviceId: null,
                    fechaCreacion: serverTimestamp()
                });
                alert("Empleado creado correctamente.");
            }
            modalEmpleado.style.display = 'none';
            loadEmpleados();
        } catch(e) {
            console.error(e);
            alert("Error al guardar: " + e.message);
        }
    } else {
        alert("Ingrese nombre y un PIN de al menos 4 dígitos");
    }
});



function getValidDate(a) {
    if (a.fechaHora && typeof a.fechaHora.toDate === 'function') {
        return a.fechaHora.toDate();
    }
    if (a.fechaHora && typeof a.fechaHora === 'string') {
        const d = new Date(a.fechaHora);
        if (!isNaN(d.getTime())) return d;
    }
    let f = a.fecha || "";
    let h = a.hora || "00:00:00";
    if (f.includes(',')) {
        const parts = f.split(',');
        f = parts[0].trim();
        h = parts[1].trim();
    }
    if (f.includes('/')) {
        const p = f.split('/');
        if (p.length === 3) {
            let y = p[2]; let m = p[1]; let d = p[0];
            if (y.length === 2) y = "20" + y;
            f = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }
    if (/a\.?\s*m\.?|p\.?\s*m\.?/i.test(h)) {
        const match = h.match(/(\d+):(\d+):?(\d*)/);
        if (match) {
            let hh = parseInt(match[1], 10);
            const mm = match[2];
            const ss = match[3] || "00";
            if (/p/i.test(h) && hh < 12) hh += 12;
            if (/a/i.test(h) && hh === 12) hh = 0;
            h = `${hh.toString().padStart(2, '0')}:${mm}:${ss}`;
        }
    } else {
        const match = h.match(/(\d+):(\d+):?(\d*)/);
        if (match) {
            h = `${match[1].padStart(2, '0')}:${match[2]}:${match[3]||"00"}`;
        }
    }
    const dt = new Date(`${f}T${h}`);
    return isNaN(dt.getTime()) ? new Date(0) : dt;
}

// Asistencias
window.loadAsistencias = async function() {
    const fechaInput = document.getElementById('asistencias-fecha');
    const d = new Date();
    const todayLocal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    let targetDate = fechaInput && fechaInput.value ? fechaInput.value : todayLocal;
    if(fechaInput && !fechaInput.value) {
        fechaInput.value = targetDate;
    }

    // Fetch 3 days to correctly pair shifts across midnight
    const dDate = new Date(targetDate + "T12:00:00");
    const dPrev = new Date(dDate); dPrev.setDate(dPrev.getDate() - 1);
    const dNext = new Date(dDate); dNext.setDate(dNext.getDate() + 1);
    
    const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const pStr = fmt(dPrev);
    const nStr = fmt(dNext);

    const q = query(collection(db, "asistencias"), where("fecha", ">=", pStr), where("fecha", "<=", nStr));
    const snap = await getDocs(q);
    
    let records = [];
    snap.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
    
    let empRecords = {};
    records.forEach(r => {
        if(!empRecords[r.empleadoId]) empRecords[r.empleadoId] = { nombre: r.nombreEmpleado, recs: [], empleadoId: r.empleadoId };
        empRecords[r.empleadoId].recs.push(r);
    });

    let finalEmpShifts = {};
    
    Object.keys(empRecords).forEach(empId => {
        let recs = empRecords[empId].recs;
        recs.sort((a,b) => getValidDate(a) - getValidDate(b));
        
        let turnos = [];
        let currentTurno = null;
        
        for (let r of recs) {
            const tipo = (r.tipoMovimiento || '').trim().toUpperCase();
            if (tipo === 'ENTRADA') {
                if (currentTurno && currentTurno.sal === null) {
                    // Mismo turno, registrar entrada duplicada
                    if (!currentTurno.ent.duplicados) currentTurno.ent.duplicados = [];
                    currentTurno.ent.duplicados.push(r);
                    if (r.metodoValidacion === 'MANUAL (ADMIN)') {
                        let oldEnt = currentTurno.ent;
                        currentTurno.ent = r;
                        currentTurno.ent.duplicados = oldEnt.duplicados || [];
                        currentTurno.ent.duplicados.push(oldEnt);
                    }
                } else {
                    if (currentTurno) turnos.push(currentTurno);
                    currentTurno = { ent: r, sal: null };
                }
            } else if (tipo === 'SALIDA') {
                if (currentTurno) {
                    if (currentTurno.sal === null) {
                        currentTurno.sal = r;
                    } else {
                        // Mismo turno, registrar salida duplicada
                        if (!currentTurno.sal.duplicados) currentTurno.sal.duplicados = [];
                        currentTurno.sal.duplicados.push(r);
                        if (r.metodoValidacion === 'MANUAL (ADMIN)') {
                            let oldSal = currentTurno.sal;
                            currentTurno.sal = r;
                            currentTurno.sal.duplicados = oldSal.duplicados || [];
                            currentTurno.sal.duplicados.push(oldSal);
                        }
                    }
                } else {
                    if (turnos.length > 0 && turnos[turnos.length - 1].ent === null) {
                        let lastTurno = turnos[turnos.length - 1];
                        if (!lastTurno.sal.duplicados) lastTurno.sal.duplicados = [];
                        lastTurno.sal.duplicados.push(r);
                        if (r.metodoValidacion === 'MANUAL (ADMIN)') {
                            let oldSal = lastTurno.sal;
                            lastTurno.sal = r;
                            lastTurno.sal.duplicados = oldSal.duplicados || [];
                            lastTurno.sal.duplicados.push(oldSal);
                        }
                    } else {
                        turnos.push({ ent: null, sal: r });
                    }
                }
            }
        }
        if (currentTurno) turnos.push(currentTurno);
        
        // Filter turnos to only show the ones that BELONG to the targetDate
        let filteredTurnos = turnos.filter(t => {
            if (t.ent) return t.ent.fecha === targetDate;
            if (t.sal) return t.sal.fecha === targetDate; // Orphaned
            return false;
        });

        if (filteredTurnos.length > 0) {
            finalEmpShifts[empId] = { 
                empleadoId: empId, 
                nombre: empRecords[empId].nombre, 
                turnos: filteredTurnos 
            };
        }
    });

    tablaAsistencias.innerHTML = '';
    
    Object.values(finalEmpShifts).forEach(emp => {
        for(let i=0; i<emp.turnos.length; i++) {
            const ent = emp.turnos[i].ent;
            const sal = emp.turnos[i].sal;
            
            let entStr = ent ? (ent.hora || (ent.fechaHora && ent.fechaHora.toDate ? ent.fechaHora.toDate().toLocaleTimeString() : ent.fechaHora)) : 'Sin Entrada';
            let salStr = sal ? (sal.hora || (sal.fechaHora && sal.fechaHora.toDate ? sal.fechaHora.toDate().toLocaleTimeString() : sal.fechaHora)) : 'Pendiente de Salida';
            
            function getIcon(met) {
                if (!met) return '';
                met = met.toUpperCase();
                if (met.includes('BIOMETR')) return '📱';
                if (met.includes('SELFIE')) return '📸';
                if (met.includes('MANUAL')) return '✍️';
                return '';
            }
            let entIconsArr = ent ? [getIcon(ent.metodoValidacion)] : [];
            if (ent && ent.duplicados) ent.duplicados.forEach(d => entIconsArr.push(getIcon(d.metodoValidacion)));
            let entIcons = [...new Set(entIconsArr)].join(' ');
            
            let salIconsArr = sal ? [getIcon(sal.metodoValidacion)] : [];
            if (sal && sal.duplicados) sal.duplicados.forEach(d => salIconsArr.push(getIcon(d.metodoValidacion)));
            let salIcons = [...new Set(salIconsArr)].join(' ');

            let entSelfie = ent && ent.urlSelfie ? ` <a href="${ent.urlSelfie}" target="_blank" style="text-decoration:none;font-size:14px;" title="Ver foto">📷</a>` : '';
            let salSelfie = sal && sal.urlSelfie ? ` <a href="${sal.urlSelfie}" target="_blank" style="text-decoration:none;font-size:14px;" title="Ver foto">📷</a>` : '';

            let entNota = (ent && ent.notas) ? ` <span title="${ent.notas}" style="cursor:help;">📝</span>` : '';
            let salNota = (sal && sal.notas) ? ` <span title="${sal.notas}" style="cursor:help;">📝</span>` : '';

            let orphanWarnEnt = !sal ? ' ⚠️' : '';
            let orphanWarnSal = !ent ? ' ⚠️' : '';

            let entBadge = ent ? `<span class="badge badge-success" title="${ent.metodoValidacion}">🟢 Entrada: ${entStr} ${entIcons}</span>${entSelfie}${entNota}` : `<span class="badge" style="background:#64748b;color:white">Sin Entrada ${orphanWarnSal}</span>`;
            
            let salBadge = sal ? `<span class="badge badge-danger" title="${sal.metodoValidacion}">🔴 Salida: ${salStr} ${salIcons}</span>${salSelfie}${salNota}` : (ent ? `<span class="badge" style="background:#f59e0b;color:white;cursor:pointer;" onclick="window.abrirModalMarcaManualSalida('${emp.empleadoId}', '${targetDate}')">⏳ Pendiente de Salida ${orphanWarnEnt}</span>` : `<span class="badge" style="background:#64748b;color:white">Sin Salida ⚠️</span>`);

            
            let tiempoStr = '-';
            if(ent && sal) {
                const dEnt = getValidDate(ent);
                const dSal = getValidDate(sal);
                const mins = (dSal - dEnt) / 60000;
                if(mins > 0) {
                    const h = Math.floor(mins / 60);
                    const m = Math.floor(mins % 60);
                    tiempoStr = `${h}h ${m}m`;
                }
            }
            
            let accionesHTML = '<div style="display:flex;gap:4px;">';
            if(ent) accionesHTML += `<button class="btn-secondary" style="font-size:10px;padding:4px 6px;" onclick="window.editarAsistencia('${ent.id}', 'ENTRADA', '${ent.fecha}', '${ent.hora}')">✏️ Ent</button>`;
            if(sal) accionesHTML += `<button class="btn-secondary" style="font-size:10px;padding:4px 6px;" onclick="window.editarAsistencia('${sal.id}', 'SALIDA', '${sal.fecha}', '${sal.hora}')">✏️ Sal</button>`;
            if(ent) accionesHTML += `<button class="btn-secondary" style="color:red;font-size:10px;padding:4px 6px;" onclick="window.eliminarAsistencia('${ent.id}')">🗑️ Ent</button>`;
            if(sal) accionesHTML += `<button class="btn-secondary" style="color:red;font-size:10px;padding:4px 6px;" onclick="window.eliminarAsistencia('${sal.id}')">🗑️ Sal</button>`;
            accionesHTML += '</div>';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${emp.nombre}</strong></td>
                <td>
                    <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
                        ${entBadge}
                        <span style="color:#94a3b8;font-weight:bold;">------</span>
                        ${salBadge}
                    </div>
                </td>
                <td style="font-weight:bold; color:#10b981; text-align:center;">${tiempoStr}</td>
                <td>${accionesHTML}</td>
            `;
            tablaAsistencias.appendChild(tr);
        }
    });
    
    if(Object.keys(finalEmpShifts).length === 0) {
        tablaAsistencias.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay asistencias para esta fecha.</td></tr>';
    }
}

async function loadAsistencias() {
    return window.loadAsistencias();
}

window.abrirModalMarcaManualSalida = async (empleadoId, fecha) => {
    await window.abrirModalMarcaManual();
    document.getElementById('manual-asis-empleado').value = empleadoId;
    document.getElementById('manual-asis-tipo').value = 'SALIDA';
    document.getElementById('manual-asis-fecha').value = fecha;
}

window.editarAsistencia = (id, tipo, fecha, hora) => {
    document.getElementById('edit-asis-id').value = id;
    document.getElementById('edit-asis-tipo').value = tipo;
    document.getElementById('edit-asis-fecha').value = fecha;
    
    let hora24 = hora;
    if(/a\.?\s*m\.?|p\.?\s*m\.?/i.test(hora)) {
        const match = hora.match(/(\d+):(\d+)/);
        if(match) {
            let hh = parseInt(match[1]);
            const mm = match[2];
            if(/p/i.test(hora) && hh < 12) hh += 12;
            if(/a/i.test(hora) && hh === 12) hh = 0;
            hora24 = `${hh.toString().padStart(2, '0')}:${mm}`;
        }
    } else if (hora.match(/^\d+:\d+$/)) {
        const parts = hora.split(':');
        hora24 = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    } else if (hora.match(/^\d+:\d+:\d+$/)) {
        const parts = hora.split(':');
        hora24 = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }

    document.getElementById('edit-asis-hora').value = hora24;
    document.getElementById('modal-asistencia').style.display = 'flex';
}

window.eliminarAsistencia = async (id) => {
    if(confirm("¿Estás seguro de eliminar esta marca de asistencia de forma permanente?")) {
        try {
            await deleteDoc(doc(db, "asistencias", id));
            alert("Marca de asistencia eliminada.");
            loadAsistencias();
        } catch(e) {
            console.error(e);
            alert("Error al eliminar: " + e.message);
        }
    }
}

window.guardarEdicionAsistencia = async () => {
    const id = document.getElementById('edit-asis-id').value;
    const tipo = document.getElementById('edit-asis-tipo').value;
    const fecha = document.getElementById('edit-asis-fecha').value;
    const horaVal = document.getElementById('edit-asis-hora').value;

    if(!fecha || !horaVal) {
        alert("Llena la fecha y hora.");
        return;
    }

    // Convertir a 12 horas (AM/PM) para mantener consistencia
    let [hh, mm] = horaVal.split(':');
    let hInt = parseInt(hh, 10);
    let ampm = hInt >= 12 ? 'PM' : 'AM';
    let h12 = hInt % 12;
    if(h12 === 0) h12 = 12;
    let hora12 = `${h12}:${mm} ${ampm}`;

    try {
        const dt = new Date(`${fecha}T${horaVal}`);
        await updateDoc(doc(db, "asistencias", id), {
            tipoMovimiento: tipo,
            fecha: fecha,
            hora: hora12,
            fechaHora: dt
        });
        alert("Asistencia editada correctamente. Recuerda regenerar las planillas afectadas.");
        document.getElementById('modal-asistencia').style.display = 'none';
        loadAsistencias();
    } catch(e) {
        console.error(e);
        alert("Error al editar: " + e.message);
    }
}

window.abrirModalMarcaManual = async () => {
    document.getElementById('modal-marca-manual').style.display = 'flex';
    const d = new Date();
    const todayLocal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    document.getElementById('manual-asis-fecha').value = todayLocal;
    document.getElementById('manual-asis-hora').value = new Date().toTimeString().split(' ')[0].substring(0, 5);
    
    const sel = document.getElementById('manual-asis-empleado');
    sel.innerHTML = '<option value="">Cargando...</option>';
    
    try {
        const empSnap = await getDocs(collection(db, "empleados"));
        sel.innerHTML = '<option value="">Seleccionar Empleado</option>';
        empSnap.forEach(doc => {
            const d = doc.data();
            const opt = document.createElement('option');
            opt.value = doc.id;
            opt.textContent = d.nombre;
            sel.appendChild(opt);
        });
    } catch(e) {
        sel.innerHTML = '<option value="">Error cargando empleados</option>';
    }
}

window.guardarMarcaManual = async () => {
    const empleadoId = document.getElementById('manual-asis-empleado').value;
    const tipo = document.getElementById('manual-asis-tipo').value;
    const fecha = document.getElementById('manual-asis-fecha').value;
    const horaVal = document.getElementById('manual-asis-hora').value;

    if(!empleadoId || !fecha || !horaVal) {
        alert("Llena todos los campos.");
        return;
    }

    // Convertir a 12 horas (AM/PM)
    let [hh, mm] = horaVal.split(':');
    let hInt = parseInt(hh, 10);
    let ampm = hInt >= 12 ? 'PM' : 'AM';
    let h12 = hInt % 12;
    if(h12 === 0) h12 = 12;
    let hora12 = `${h12}:${mm} ${ampm}`;

    const selectEl = document.getElementById('manual-asis-empleado');
    const nombreEmpleado = selectEl.options[selectEl.selectedIndex].text;

    try {
        const dt = new Date(`${fecha}T${horaVal}`);
        
        await setDoc(doc(collection(db, "asistencias")), {
            empleadoId: empleadoId,
            nombreEmpleado: nombreEmpleado,
            tipoMovimiento: tipo,
            fecha: fecha,
            hora: hora12,
            fechaHora: dt,
            metodoValidacion: "MANUAL (ADMIN)",
            latitudActual: 0,
            longitudActual: 0,
            urlSelfie: ""
        });
        
        alert("Marca manual creada exitosamente. Recuerda regenerar las planillas afectadas.");
        document.getElementById('modal-marca-manual').style.display = 'none';
        loadAsistencias();
    } catch(e) {
        console.error(e);
        alert("Error al crear marca: " + e.message);
    }
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

