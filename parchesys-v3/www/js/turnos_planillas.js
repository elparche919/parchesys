import { db, collection, getDocs, query, where, doc, setDoc, updateDoc, serverTimestamp, getDoc, addDoc } from './firebase-config.js';

const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Helper para obtener el inicio de la semana (Lunes)
function getMonday(d) {
  d = new Date(d);
  var day = d.getDay(),
      diff = d.getDate() - day + (day == 0 ? -6: 1); // ajusta cuando es domingo
  return new Date(d.setDate(diff));
}

window.aplicarPresetTurno = function() {
    const val = document.getElementById('turno-preset').value;
    if (val) {
        const [hin, hout] = val.split('-');
        document.getElementById('turno-in').value = hin;
        document.getElementById('turno-out').value = hout;
    }
}

// -------------------------------
// TURNOS
// -------------------------------

window.loadTurnosSemana = async function() {
    const inputFecha = document.getElementById('turnos-fecha-inicio').value;
    if (!inputFecha) {
        alert("Selecciona una fecha para ver la semana");
        return;
    }

    const startOfWeek = getMonday(new Date(inputFecha + 'T12:00:00'));
    
    // Obtener array de los 7 dias (lunes a domingo) formato YYYY-MM-DD
    const dates = [];
    for(let i=0; i<7; i++) {
        let cd = new Date(startOfWeek);
        cd.setDate(cd.getDate() + i);
        dates.push(cd.toISOString().split('T')[0]);
    }

    // Actualizar Header Tabla
    const head = document.getElementById('tb-turnos-head');
    let headHtml = '<th>Empleado</th>';
    dates.forEach((d, idx) => {
        headHtml += `<th style="text-align:center;">${diasSemana[idx]}<br><span style="font-size:10px; opacity:0.8">${d}</span></th>`;
    });
    head.innerHTML = headHtml;

    // Cargar Empleados
    const empSnap = await getDocs(query(collection(db, "empleados"), where("estado", "==", "Activo")));
    const empleados = [];
    const empSelect = document.getElementById('turno-empleado');
    empSelect.innerHTML = '<option value="">Seleccionar Empleado</option>';

    empSnap.forEach(d => {
        const emp = { id: d.id, ...d.data() };
        empleados.push(emp);
        empSelect.innerHTML += `<option value="${emp.id}">${emp.nombre}</option>`;
    });

    // Cargar Turnos de esa semana
    const q = query(collection(db, "turnos"), where("fecha", ">=", dates[0]), where("fecha", "<=", dates[6]));
    const turnosSnap = await getDocs(q);
    const turnosArr = [];
    turnosSnap.forEach(t => turnosArr.push({ id: t.id, ...t.data() }));

    // Renderizar Filas
    const tbody = document.getElementById('tabla-turnos');
    tbody.innerHTML = '';
    
    if(empleados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No hay empleados</td></tr>';
        return;
    }

    empleados.forEach(emp => {
        let tr = `<tr><td><strong>${emp.nombre}</strong></td>`;
        dates.forEach(d => {
            const turnoDia = turnosArr.find(t => t.emp_id === emp.id && t.fecha === d);
            if (turnoDia) {
                tr += `<td style="text-align:center; background:#dbeafe; color:#1e40af; cursor:pointer;" onclick="editarTurno('${turnoDia.id}', '${emp.id}', '${d}', '${turnoDia.hora_in}', '${turnoDia.hora_out}')">
                        <b>${turnoDia.hora_in} - ${turnoDia.hora_out}</b>
                       </td>`;
            } else {
                tr += `<td style="text-align:center; color:#cbd5e1; cursor:pointer;" onclick="nuevoTurnoRapido('${emp.id}', '${d}')">+ Asignar</td>`;
            }
        });
        tr += `</tr>`;
        tbody.innerHTML += tr;
    });
}

window.nuevoTurnoRapido = function(empId, fecha) {
    document.getElementById('turno-empleado').value = empId;
    document.getElementById('turno-fecha').value = fecha;
    document.getElementById('turno-in').value = "08:00";
    document.getElementById('turno-out').value = "17:00";
    document.getElementById('modalTurno').style.display = 'flex';
}

window.editarTurno = function(turnoId, empId, fecha, hIn, hOut) {
    // Si queremos eliminar o modificar
    if(confirm(`¿Deseas ELIMINAR el turno de ${hIn} a ${hOut} para la fecha ${fecha}? (Click Cancelar para solo editar)`)) {
        // En una app real usariamos deleteDoc
        alert("Eliminación manual pendiente de UI. Reasignaremos encima por ahora.");
    }
    
    document.getElementById('turno-empleado').value = empId;
    document.getElementById('turno-fecha').value = fecha;
    document.getElementById('turno-in').value = hIn;
    document.getElementById('turno-out').value = hOut;
    document.getElementById('modalTurno').style.display = 'flex';
}

window.guardarTurnoUI = async function() {
    const empId = document.getElementById('turno-empleado').value;
    const fecha = document.getElementById('turno-fecha').value;
    const horaIn = document.getElementById('turno-in').value;
    const horaOut = document.getElementById('turno-out').value;

    if(!empId || !fecha || !horaIn || !horaOut) {
        alert("Llena todos los campos");
        return;
    }

    try {
        // En Firestore, el ID del turno será {empId}_{fecha} para evitar duplicados en el mismo dia
        const turnoRef = doc(db, "turnos", `${empId}_${fecha}`);
        await setDoc(turnoRef, {
            emp_id: empId,
            fecha: fecha,
            hora_in: horaIn,
            hora_out: horaOut,
            actualizado: serverTimestamp()
        });
        
        document.getElementById('modalTurno').style.display = 'none';
        window.loadTurnosSemana();
    } catch (e) {
        console.error(e);
        alert("Error al guardar turno: " + e.message);
    }
}

// -------------------------------
// PLANILLAS
// -------------------------------

let ultimaPlanillaCalculada = null; // Para guardar el històrico luego

function calcularMinutosEntreHoras(hIn, hOut) {
    const [h1, m1] = hIn.split(':').map(Number);
    const [h2, m2] = hOut.split(':').map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
}

window.calcularPlanillaUI = async function() {
    const inicio = document.getElementById('planilla-fecha-inicio').value;
    const fin = document.getElementById('planilla-fecha-fin').value;

    if (!inicio || !fin) {
        alert("Selecciona rango de fechas");
        return;
    }

    const tbody = document.getElementById('tabla-planilla');
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Calculando...</td></tr>';

    try {
        // 1. Obtener empleados activos
        const empSnap = await getDocs(query(collection(db, "empleados"), where("estado", "==", "Activo")));
        const empleados = [];
        empSnap.forEach(d => empleados.push({ id: d.id, ...d.data() }));

        // 2. Obtener turnos en el rango
        const turnosSnap = await getDocs(query(collection(db, "turnos"), where("fecha", ">=", inicio), where("fecha", "<=", fin)));
        const turnos = [];
        turnosSnap.forEach(t => turnos.push({ id: t.id, ...t.data() }));

        // 3. Obtener asistencias en el rango
        const asisSnap = await getDocs(query(collection(db, "asistencias"), where("fecha", ">=", inicio), where("fecha", "<=", fin)));
        const asistencias = [];
        asisSnap.forEach(a => asistencias.push({ id: a.id, ...a.data() }));

        let granTotal = 0;
        let resultadoPlanilla = [];
        tbody.innerHTML = '';

        empleados.forEach(emp => {
            const turnosEmp = turnos.filter(t => t.emp_id === emp.id);
            const asisEmp = asistencias.filter(a => a.empleadoId === emp.id);
            
            let minRegulares = 0;
            let minExtra = 0;
            
            let currD = new Date(inicio + 'T12:00:00');
            const endD = new Date(fin + 'T12:00:00');
            
            while(currD <= endD) {
                const strDate = currD.toISOString().split('T')[0];
                const turno = turnosEmp.find(t => t.fecha === strDate);
                const asisDia = asisEmp.filter(a => a.fecha === strDate);
                
                if (turno && asisDia.length > 0) {
                    const duracionTurno = calcularMinutosEntreHoras(turno.hora_in, turno.hora_out);
                    
                    const entradas = asisDia.filter(a => a.tipoMovimiento === 'Entrada');
                    const salidas = asisDia.filter(a => a.tipoMovimiento === 'Salida');
                    
                    if (entradas.length > 0 && salidas.length > 0) {
                        const primeraEntrada = entradas[0];
                        const ultimaSalida = salidas[salidas.length - 1];
                        const trabajado = calcularMinutosEntreHoras(primeraEntrada.hora, ultimaSalida.hora);
                        
                        if (trabajado > 0) {
                            if (trabajado >= duracionTurno) {
                                minRegulares += duracionTurno;
                                minExtra += (trabajado - duracionTurno);
                            } else {
                                minRegulares += trabajado;
                            }
                        }
                    }
                } else if (!turno && asisDia.length > 0) {
                    const entradas = asisDia.filter(a => a.tipoMovimiento === 'Entrada');
                    const salidas = asisDia.filter(a => a.tipoMovimiento === 'Salida');
                    if (entradas.length > 0 && salidas.length > 0) {
                        const trabajado = calcularMinutosEntreHoras(entradas[0].hora, salidas[salidas.length - 1].hora);
                        if (trabajado > 0) minExtra += trabajado;
                    }
                }
                
                currD.setDate(currD.getDate() + 1);
            }

            const horasReg = (minRegulares / 60).toFixed(2);
            const horasExt = (minExtra / 60).toFixed(2);
            
            const costoHora = Number(emp.salarioBase) || 0;
            let subtotal = (minRegulares / 60) * costoHora;
            let pagoExtra = (minExtra / 60) * (Number(emp.valorHoraExtra) || 0);
            
            let bruto = subtotal + pagoExtra;
            let isss = 0;
            let afp = 0;
            
            if (emp.aplicaLey) {
                isss = bruto * 0.03;
                if (isss > 30) isss = 30;
                afp = bruto * 0.0725;
            }
            
            const totalDeduc = isss + afp;
            const neto = bruto - totalDeduc;

            resultadoPlanilla.push({
                empId: emp.id,
                nombre: emp.nombre,
                horasReg,
                horasExt,
                subtotal,
                pagoExtra,
                isss,
                afp,
                totalDeduc,
                neto
            });

            granTotal += neto;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${emp.nombre}</strong></td>
                    <td style="text-align:center">${horasReg}</td>
                    <td style="text-align:center">${horasExt}</td>
                    <td style="text-align:right">$${subtotal.toFixed(2)}</td>
                    <td style="text-align:right">$${pagoExtra.toFixed(2)}</td>
                    <td style="text-align:right; color: #ef4444;">-$${isss.toFixed(2)}</td>
                    <td style="text-align:right; color: #ef4444;">-$${afp.toFixed(2)}</td>
                    <td style="text-align:right; color: #ef4444;">-$${totalDeduc.toFixed(2)}</td>
                    <td style="text-align:right; font-weight:bold; color: #10b981;">$${neto.toFixed(2)}</td>
                </tr>
            `;
        });

        document.getElementById('planilla-gran-total').textContent = `$${granTotal.toFixed(2)}`;
        
        ultimaPlanillaCalculada = {
            rango: `${inicio} al ${fin}`,
            granTotal: granTotal,
            detalles: resultadoPlanilla,
            fechaGeneracion: new Date().toISOString()
        };

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="9" style="color:red">Error: ${e.message}</td></tr>`;
    }
}

window.guardarCortePlanilla = async function() {
    if(!ultimaPlanillaCalculada) {
        alert("Primero debes Generar la Planilla para poder guardarla.");
        return;
    }

    if(confirm("¿Estás seguro de guardar esta planilla? Quedará guardada inmutablemente en el histórico.")) {
        try {
            await addDoc(collection(db, "planillas_historico"), ultimaPlanillaCalculada);
            alert("¡Planilla Guardada en el Histórico Exitosamente!");
        } catch(e) {
            console.error(e);
            alert("Error al guardar planilla: " + e.message);
        }
    }
}
