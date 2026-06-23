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

window.cargarSemanaActualTurnos = function() {
    const monday = getMonday(new Date());
    const strDate = monday.toISOString().split('T')[0];
    document.getElementById('turnos-fecha-inicio').value = strDate;
    window.loadTurnosSemana();
}

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
    let t1 = h1 * 60 + m1;
    let t2 = h2 * 60 + m2;
    if (t2 < t1) {
        t2 += 24 * 60; // Cruzó la medianoche
    }
    return t2 - t1;
}

window.cargarSemanaActualPlanilla = function() {
    const monday = getMonday(new Date());
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    document.getElementById('planilla-fecha-inicio').value = monday.toISOString().split('T')[0];
    document.getElementById('planilla-fecha-fin').value = sunday.toISOString().split('T')[0];
    window.calcularPlanillaUI();
}

window.recalcularFilaPlanilla = function(empId) {
    const row = document.getElementById(`fila-planilla-${empId}`);
    if(!row) return;

    const subtotal = parseFloat(row.dataset.subtotal) || 0;
    const pagoExtra = parseFloat(row.dataset.pagoextra) || 0;
    
    const bonoManual = parseFloat(document.getElementById(`bono-${empId}`).value) || 0;
    const deducManual = parseFloat(document.getElementById(`deduc-${empId}`).value) || 0;
    
    const nuevoNeto = subtotal + pagoExtra + bonoManual - deducManual;
    
    document.getElementById(`neto-${empId}`).textContent = `$${nuevoNeto.toFixed(2)}`;
    
    let granTotal = 0;
    const filas = document.querySelectorAll('[id^="fila-planilla-"]');
    filas.forEach(f => {
        const id = f.id.replace('fila-planilla-', '');
        const st = parseFloat(f.dataset.subtotal) || 0;
        const pe = parseFloat(f.dataset.pagoextra) || 0;
        const bm = parseFloat(document.getElementById(`bono-${id}`).value) || 0;
        const dm = parseFloat(document.getElementById(`deduc-${id}`).value) || 0;
        granTotal += (st + pe + bm - dm);
    });
    
    document.getElementById('planilla-gran-total').textContent = `$${granTotal.toFixed(2)}`;
}

window.calcularPlanillaUI = async function() {
    const inicio = document.getElementById('planilla-fecha-inicio').value;
    const fin = document.getElementById('planilla-fecha-fin').value;

    if (!inicio || !fin) {
        alert("Selecciona rango de fechas");
        return;
    }

    const tbody = document.getElementById('tabla-planilla');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Calculando...</td></tr>';

    try {
        const empSnap = await getDocs(query(collection(db, "empleados"), where("estado", "==", "Activo")));
        const empleados = [];
        empSnap.forEach(d => empleados.push({ id: d.id, ...d.data() }));

        const turnosSnap = await getDocs(query(collection(db, "turnos"), where("fecha", ">=", inicio), where("fecha", "<=", fin)));
        const turnos = [];
        turnosSnap.forEach(t => turnos.push({ id: t.id, ...t.data() }));

        const asisSnap = await getDocs(query(collection(db, "asistencias"), where("fecha", ">=", inicio), where("fecha", "<=", fin)));
        const asistencias = [];
        asisSnap.forEach(a => asistencias.push({ id: a.id, ...a.data() }));

        let granTotal = 0;
        let resultadoPlanilla = [];
        tbody.innerHTML = '';

        empleados.forEach(emp => {
            const turnosEmp = turnos.filter(t => t.emp_id === emp.id);
            const asisEmp = asistencias.filter(a => a.empleadoId === emp.id);
            
            // 1. Ordenar asistencias cronológicamente exacto
            asisEmp.sort((a, b) => new Date(`${a.fecha}T${a.hora}`) - new Date(`${b.fecha}T${b.hora}`));
            
            const tiempoPorFechaTurno = {};
            let entradaActual = null;
            
            // 2. Emparejar Entradas y Salidas
            asisEmp.forEach(a => {
                const tipo = (a.tipoMovimiento || '').toUpperCase();
                if (tipo === 'ENTRADA') {
                    entradaActual = a;
                } else if (tipo === 'SALIDA' && entradaActual) {
                    const d1 = new Date(`${entradaActual.fecha}T${entradaActual.hora}`);
                    const d2 = new Date(`${a.fecha}T${a.hora}`);
                    const trabajadoMins = (d2 - d1) / 60000;
                    
                    if (trabajadoMins > 0) {
                        const shiftDate = entradaActual.fecha;
                        if (!tiempoPorFechaTurno[shiftDate]) {
                            tiempoPorFechaTurno[shiftDate] = 0;
                        }
                        tiempoPorFechaTurno[shiftDate] += trabajadoMins;
                    }
                    entradaActual = null; // Reset para el siguiente par
                }
            });
            
            let minRegulares = 0;
            let minExtra = 0;
            
            // 3. Separar en Regulares y Extras por cada día de turno acumulado
            for (const [shiftDate, totalTrabajado] of Object.entries(tiempoPorFechaTurno)) {
                const turno = turnosEmp.find(t => t.fecha === shiftDate);
                if (turno) {
                    const duracionTurno = calcularMinutosEntreHoras(turno.hora_in, turno.hora_out);
                    if (totalTrabajado >= duracionTurno) {
                        minRegulares += duracionTurno;
                        minExtra += (totalTrabajado - duracionTurno);
                    } else {
                        minRegulares += totalTrabajado;
                    }
                } else {
                    // Si no tenía turno asignado ese día, todo es extra
                    minExtra += totalTrabajado;
                }
            }

            const horasRegDecimal = minRegulares / 60;
            const horasExtDecimal = minExtra / 60;
            
            const horasReg = horasRegDecimal.toFixed(2);
            const horasExt = horasExtDecimal.toFixed(2);
            
            const costoHora = Number(emp.salarioBase) || 0;
            const costoExtra = Number(emp.valorHoraExtra) || 0;
            
            let subtotal = horasRegDecimal * costoHora;
            let pagoExtra = horasExtDecimal * costoExtra;
            
            let neto = subtotal + pagoExtra;

            resultadoPlanilla.push({
                empId: emp.id,
                nombre: emp.nombre,
                horasReg,
                horasExt,
                subtotal,
                pagoExtra,
                neto_base: neto
            });

            granTotal += neto;

            tbody.innerHTML += `
                <tr id="fila-planilla-${emp.id}" data-subtotal="${subtotal.toFixed(2)}" data-pagoextra="${pagoExtra.toFixed(2)}">
                    <td><strong>${emp.nombre}</strong></td>
                    <td style="text-align:center">${horasReg}</td>
                    <td style="text-align:center">${horasExt}</td>
                    <td style="text-align:right">$${subtotal.toFixed(2)}</td>
                    <td style="text-align:right">$${pagoExtra.toFixed(2)}</td>
                    <td style="text-align:center"><input type="number" id="bono-${emp.id}" class="input-field" style="width: 80px;" value="0" min="0" step="0.01" oninput="recalcularFilaPlanilla('${emp.id}')"></td>
                    <td style="text-align:center"><input type="number" id="deduc-${emp.id}" class="input-field" style="width: 80px;" value="0" min="0" step="0.01" oninput="recalcularFilaPlanilla('${emp.id}')"></td>
                    <td style="text-align:right; font-weight:bold; color: #10b981;" id="neto-${emp.id}">$${neto.toFixed(2)}</td>
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
        tbody.innerHTML = `<tr><td colspan="8" style="color:red">Error: ${e.message}</td></tr>`;
    }
}

window.guardarCortePlanilla = async function() {
    if(!ultimaPlanillaCalculada) {
        alert("Primero debes Generar la Planilla para poder guardarla.");
        return;
    }

    if(confirm("¿Estás seguro de guardar esta planilla? Quedará guardada inmutablemente en el histórico.")) {
        try {
            let finalGranTotal = 0;
            ultimaPlanillaCalculada.detalles = ultimaPlanillaCalculada.detalles.map(det => {
                const bonoManual = parseFloat(document.getElementById(`bono-${det.empId}`).value) || 0;
                const deducManual = parseFloat(document.getElementById(`deduc-${det.empId}`).value) || 0;
                const finalNeto = det.neto_base + bonoManual - deducManual;
                finalGranTotal += finalNeto;
                return {
                    ...det,
                    bonoManual,
                    deduccionManual: deducManual,
                    neto_final: finalNeto
                };
            });
            ultimaPlanillaCalculada.granTotal = finalGranTotal;

            await addDoc(collection(db, "planillas_historico"), ultimaPlanillaCalculada);
            alert("¡Planilla Guardada en el Histórico Exitosamente!");
        } catch(e) {
            console.error(e);
            alert("Error al guardar planilla: " + e.message);
        }
    }
}
