const API='http://localhost:3000/api', content=document.querySelector('#content'), noticeEl=document.querySelector('#notice');
const titles={dashboard:'Dashboard',entrada:'Registrar entrada',salida:'Registrar salida',espacios:'Espacios de estacionamiento',estadias:'Historial de estadías',clientes:'Clientes',vehiculos:'Vehículos',pagos:'Pagos registrados',reportes:'Reportes'};
const money=v=>`L ${Number(v||0).toLocaleString('es-HN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date=v=>v?new Intl.DateTimeFormat('es-HN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
const reportMonths=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const reportDateParts=value=>String(value??'').match(/^(\d{4})-(\d{2})-(\d{2})/);
const reportMonth=value=>{const parts=String(value??'').match(/^(\d{4})-(0[1-9]|1[0-2])$/);return parts?`${reportMonths[Number(parts[2])-1]} de ${parts[1]}`:'—'};
const reportDate=value=>{const parts=reportDateParts(value);return parts?`${Number(parts[3])}/${Number(parts[2])}/${parts[1]}`:'—'};
const esc=v=>String(v??'—').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const badge=s=>`<span class="badge ${esc(s)}">${esc(s)}</span>`;
async function api(path, options) {
    try {
        const r = await fetch(API + path, options);

        const text = await r.text();

        let data;

        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = {
                error: text || 'El servidor devolvió una respuesta no válida.'
            };
        }

        if (!r.ok) {
            throw new Error(
                data.error ||
                `Error HTTP ${r.status}`
            );
        }

        return data;

    } catch (err) {
        console.error(`API ${path}:`, err);

        if (err.name === 'TypeError') {
            throw new Error(
                'No se pudo conectar con el servidor. Verifique que el backend esté ejecutándose en el puerto 3000.'
            );
        }

        throw err;
    }
}
const get=path=>api(path);
const localDateTimeValue = value => {
    const d = value ? new Date(value) : new Date();
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16);
};
let entryVehicleToSelect = null;
function notice(message,type='success'){noticeEl.className=type;noticeEl.textContent=message;noticeEl.style.display='block'}
function clearNotice(){noticeEl.style.display='none';noticeEl.textContent=''}
function table(headers, rows){return rows.length?`<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:'<p class="empty">No hay registros para mostrar.</p>'}
async function refreshAfterStayChange(view, data, message, isExit=false){
    await show(view);
    notice(message);
    content.insertAdjacentHTML('beforeend',ticket(data,isExit));
}
function formSubmit(selector, path, method, onSuccess) {
    const form = document.querySelector(selector);

    if (!form) {
        console.error(`No se encontró el formulario: ${selector}`);
        return;
    }

    form.onsubmit = async e => {
        e.preventDefault();
        clearNotice();

        const button = e.target.querySelector(
            'button[type="submit"], input[type="submit"], button.submit'
        );

        if (button) {
            button.disabled = true;
        }

        try {
            const data = await api(path, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(
                    Object.fromEntries(new FormData(e.target))
                )
            });

            notice('Operación realizada correctamente.');

            if (onSuccess) {
                await onSuccess(data, e.target);
            }

        } catch (err) {
            console.error('Error en formulario:', err);
            notice(
                err.message || 'No se pudo completar la operación.',
                'error'
            );

        } finally {
            if (button) {
                button.disabled = false;
            }
        }
    };
}
function ticket(x, salida=false){return `<div class="modal"><article class="ticket"><button type="button" class="close" onclick="this.closest('.modal').remove()">×</button><h2>PARKCONTROL</h2><p>Sistema de Gestión de Estacionamiento</p><hr><h3>Ticket de ${salida?'salida':'entrada'}</h3><dl><dt>Estadía</dt><dd>#${x.estadia_id}</dd><dt>Placa</dt><dd>${esc(x.placa)}</dd><dt>Tipo</dt><dd>${esc(x.tipo_vehiculo)}</dd><dt>Espacio / zona</dt><dd>${esc(x.espacio)} · ${esc(x.zona)}</dd><dt>Entrada</dt><dd>${date(x.fecha_entrada)}</dd>${salida?`<dt>Salida</dt><dd>${date(x.fecha_salida)}</dd><dt>Duración</dt><dd>${x.duracion_minutos} minutos</dd><dt>Tarifa</dt><dd>${money(x.precio_hora)} / hora</dd><dt>Total</dt><dd class="total">${money(x.total)}</dd><dt>Pago</dt><dd>${esc(x.metodo_pago)}</dd>`:`<dt>Tarifa por hora</dt><dd>${money(x.precio_hora)}</dd>`}</dl><p>${salida?'Gracias por utilizar ParkControl.':'Conserve este ticket para registrar su salida.'}</p><button type="button" class="submit" onclick="window.print()">Imprimir ticket</button></article></div>`}
async function dashboard(){const [d,spaces]=await Promise.all([get('/dashboard'),get('/espacios')]),r=d.resumen;content.innerHTML=`<div class="stats"><div class="card"><span>Total de espacios</span><b>${r.total_espacios}</b></div><div class="card"><span>Ocupados</span><b>${r.ocupados}</b></div><div class="card"><span>Disponibles</span><b>${r.disponibles}</b></div><div class="card"><span>Ocupación</span><b>${r.porcentaje_ocupacion||0}%</b></div><div class="card"><span>Ingresos de hoy</span><b class="money">${money(r.ingresos_hoy)}</b></div></div><div class="grid"><article class="panel"><h2>Mapa de espacios</h2><div class="parking-grid">${spaces.map(s=>`<div class="spot ${s.estado.toLowerCase()}"><strong>${esc(s.codigo)}</strong><small>${esc(s.zona)} · ${esc(s.tipo_vehiculo)}</small>${badge(s.estado)}</div>`).join('')}</div></article><article class="panel"><h2>Estadías activas (${d.estadias_activas.length})</h2>${table(['ID','Placa','Ubicación','Entrada'],d.estadias_activas.map(x=>`<tr><td>#${x.estadia_id}</td><td>${esc(x.placa)}</td><td>${esc(x.zona)} · ${esc(x.espacio)}</td><td>${date(x.fecha_entrada)}</td></tr>`))}</article></div><div class="grid"><article class="panel"><h2>Últimas estadías</h2>${table(['Cliente','Placa','Estado','Total'],d.ultimas_estadias.map(x=>`<tr><td>${esc(x.cliente)}</td><td>${esc(x.placa)}</td><td>${badge(x.estado)}</td><td>${money(x.total)}</td></tr>`))}</article><article class="panel"><h2>Últimos pagos</h2>${table(['Estadía','Método','Monto'],d.ultimos_pagos.map(x=>`<tr><td>#${x.estadia_id}</td><td>${esc(x.metodo_pago)}</td><td>${money(x.monto)}</td></tr>`))}</article></div>`}
async function entrada(){
    const [vehicles,users,activeStays]=await Promise.all([get('/vehiculos'),get('/usuarios'),get('/estadias/activas')]);
    const activeVehicleIds=new Set(activeStays.map(stay=>stay.vehiculo_id));
    const availableVehicles=vehicles.filter(vehicle=>!activeVehicleIds.has(vehicle.vehiculo_id));
    content.innerHTML=`<div class="split"><form class="form-card" id="entry"><h2>Registrar entrada</h2><label>Buscar vehículo por placa</label><input id="vehicleSearch" placeholder="Escriba una placa"><label>Vehículo</label><select name="placa" id="entryVehicle" required><option value="">Seleccione un vehículo</option>${availableVehicles.map(v=>`<option value="${esc(v.placa)}" data-type="${v.tipo_vehiculo_id}">${esc(v.placa)} — ${esc(v.cliente)}</option>`).join('')}</select><button type="button" class="secondary" id="newVehicle">Registrar vehículo nuevo</button><label>Espacio disponible compatible</label><select name="codigo_espacio" id="entrySpace" required disabled><option value="">Seleccione primero un vehículo</option></select><label>Fecha y hora de entrada</label><input type="datetime-local" name="fecha_entrada" id="entryDate" required value="${localDateTimeValue()}"><button type="button" class="link-button" id="entryNow">Usar hora actual</button><label>Usuario operador</label><select name="nombre_usuario" required><option value="">Seleccione operador</option>${users.map(u=>`<option value="${esc(u.nombre_usuario)}">${esc(u.nombre_completo)} (${esc(u.nombre_usuario)})</option>`).join('')}</select><button type="submit" class="submit">Registrar entrada</button></form></div>`;
    const vehicle=document.querySelector('#entryVehicle'),space=document.querySelector('#entrySpace');
    const loadSpaces=async()=>{
        space.disabled=!vehicle.value;
        if(!vehicle.value){space.innerHTML='<option value="">Seleccione primero un vehículo</option>';return}
        const type=vehicle.selectedOptions[0]?.dataset.type;
        const spaces=await get(`/espacios?disponibles=true&tipo_vehiculo_id=${encodeURIComponent(type)}`);
        space.innerHTML=`<option value="">Seleccione un espacio</option>${spaces.map(s=>`<option value="${esc(s.codigo)}">${esc(s.codigo)} — ${esc(s.zona)} — ${esc(s.tipo_vehiculo)}</option>`).join('')}`;
    };
    document.querySelector('#vehicleSearch').oninput=e=>{const q=e.target.value.toLowerCase();[...vehicle.options].forEach((o,i)=>o.hidden=i>0&&!o.textContent.toLowerCase().includes(q))};
    vehicle.onchange=()=>loadSpaces().catch(err=>notice(err.message,'error'));
    document.querySelector('#entryNow').onclick=()=>{document.querySelector('#entryDate').value=localDateTimeValue()};
    document.querySelector('#newVehicle').onclick=()=>vehicleForm({}, {returnToEntrada:true});
    if(entryVehicleToSelect){vehicle.value=entryVehicleToSelect;entryVehicleToSelect=null;await loadSpaces()}
    formSubmit('#entry','/entrada','POST',data=>refreshAfterStayChange('entrada',data,`Entrada registrada: estadía #${data.estadia_id}, ${data.placa}, espacio ${data.espacio}.`));
}
async function salida(){
    const [active,methods]=await Promise.all([get('/estadias/activas'),get('/metodos-pago')]);
    content.innerHTML=`<div class="split"><article class="panel"><h2>Estadías activas</h2><div class="active-list">${active.length?active.map(x=>`<button type="button" class="active-stay" data-id="${x.estadia_id}"><b>#${x.estadia_id} · ${esc(x.placa)}</b><small>${esc(x.cliente)} · ${esc(x.zona)} / ${esc(x.espacio)}<br>Entrada: ${date(x.fecha_entrada)}</small></button>`).join(''):'<p class="empty">No hay vehículos estacionados.</p>'}</div></article><form class="form-card" id="exit"><h2>Registrar salida</h2><div id="exitSummary"><p class="empty">Seleccione una estadía activa para ver el resumen.</p></div><input type="hidden" name="estadia_id" required><label>Fecha y hora de salida</label><input type="datetime-local" name="fecha_salida" id="exitDate" required value="${localDateTimeValue()}"><button type="button" class="link-button" id="exitNow">Usar hora actual</button><label>Método de pago</label><select name="metodo_pago" required><option value="">Seleccione método de pago</option>${methods.map(m=>`<option value="${esc(m.nombre)}">${esc(m.nombre)}</option>`).join('')}</select><button type="submit" class="submit">Registrar salida</button></form></div>`;
    const exitDate=document.querySelector('#exitDate');
    document.querySelector('#exitNow').onclick=()=>{exitDate.value=localDateTimeValue()};
    document.querySelectorAll('.active-stay').forEach(b=>b.onclick=()=>{const x=active.find(a=>a.estadia_id==b.dataset.id);document.querySelector('[name=estadia_id]').value=x.estadia_id;exitDate.min=localDateTimeValue(x.fecha_entrada);document.querySelector('#exitSummary').innerHTML=`<dl class="summary"><dt>Vehículo</dt><dd>${esc(x.placa)} · ${esc(x.tipo_vehiculo)}</dd><dt>Espacio</dt><dd>${esc(x.zona)} · ${esc(x.espacio)}</dd><dt>Entrada</dt><dd>${date(x.fecha_entrada)}</dd><dt>Tarifa</dt><dd>${money(x.precio_hora)} / hora</dd></dl>`});
    formSubmit('#exit','/salida','POST',data=>refreshAfterStayChange('salida',data,`Estadía #${data.estadia_id} finalizada. Total: ${money(data.total)}.`,true));
}
async function clientForm(x={}){content.innerHTML=`<form class="form-card" id="clientForm"><h2>${x.cliente_id?'Editar':'Nuevo'} cliente</h2><label>Nombre</label><input name="nombre" required value="${esc(x.nombre||'')}"><label>Apellido</label><input name="apellido" required value="${esc(x.apellido||'')}"><label>Teléfono</label><input name="telefono" value="${esc(x.telefono||'')}"><label>Correo</label><input type="email" name="correo" value="${esc(x.correo||'')}"><button type="submit" class="submit">Guardar cliente</button><button type="button" class="secondary" onclick="show('clientes')">Cancelar</button></form>`;formSubmit('#clientForm',`/clientes${x.cliente_id?'/'+x.cliente_id:''}`,x.cliente_id?'PUT':'POST',()=>show('clientes'))}
async function vehicleForm(x={}, options={}){const [clients,types]=await Promise.all([get('/clientes'),get('/tipos-vehiculo')]);content.innerHTML=`<form class="form-card" id="vehicleForm"><h2>${x.vehiculo_id?'Editar':'Registrar'} vehículo</h2><label>Placa</label><input name="placa" maxlength="15" required value="${esc(x.placa||'')}"><label>Cliente</label><select name="cliente_id"><option value="">Sin cliente</option>${clients.map(c=>`<option value="${c.cliente_id}" ${x.cliente_id==c.cliente_id?'selected':''}>${esc(c.nombre)} ${esc(c.apellido)}</option>`).join('')}</select><button type="button" class="link-button" id="quickClient">+ Crear cliente nuevo</button><label>Tipo de vehículo</label><select name="tipo_vehiculo_id" required><option value="">Seleccione tipo</option>${types.map(t=>`<option value="${t.tipo_vehiculo_id}" ${x.tipo_vehiculo_id==t.tipo_vehiculo_id?'selected':''}>${esc(t.nombre)}</option>`).join('')}</select><label>Marca</label><input name="marca" value="${esc(x.marca||'')}"><label>Modelo</label><input name="modelo" value="${esc(x.modelo||'')}"><label>Año</label><input type="number" name="anio" min="1900" max="2100" value="${esc(x.anio||'')}"><button type="submit" class="submit">Guardar vehículo</button><button type="button" class="secondary" id="cancelVehicle">Cancelar</button></form>`;document.querySelector('#quickClient').onclick=()=>clientForm();document.querySelector('#cancelVehicle').onclick=()=>show(options.returnToEntrada?'entrada':'vehiculos');formSubmit('#vehicleForm',`/vehiculos${x.vehiculo_id?'/'+x.vehiculo_id:''}`,x.vehiculo_id?'PUT':'POST',data=>{if(options.returnToEntrada){entryVehicleToSelect=data.placa;return show('entrada')}return show('vehiculos')})}
async function spaceForm(x={}){const [zones,types]=await Promise.all([get('/zonas'),get('/tipos-vehiculo')]);content.innerHTML=`<form class="form-card" id="spaceForm"><h2>${x.espacio_id?'Editar':'Crear'} espacio</h2><label>Código</label><input name="codigo" required maxlength="10" value="${esc(x.codigo||'')}"><label>Zona</label><select name="zona_id" required>${zones.map(z=>`<option value="${z.zona_id}" ${x.zona_id==z.zona_id?'selected':''}>${esc(z.nombre)}</option>`).join('')}</select><label>Tipo de vehículo</label><select name="tipo_vehiculo_id" required>${types.map(t=>`<option value="${t.tipo_vehiculo_id}" ${x.tipo_vehiculo_id==t.tipo_vehiculo_id?'selected':''}>${esc(t.nombre)}</option>`).join('')}</select><button type="submit" class="submit">Guardar espacio</button><button type="button" class="secondary" onclick="show('espacios')">Cancelar</button></form>`;formSubmit('#spaceForm',`/espacios${x.espacio_id?'/'+x.espacio_id:''}`,x.espacio_id?'PUT':'POST',()=>show('espacios'))}
async function clients(){const rows=await get('/clientes');content.innerHTML=`<article class="panel"><div class="panel-title"><h2>Clientes</h2><button type="button" class="submit" id="add">+ Nuevo cliente</button></div>${table(['Nombre','Teléfono','Correo','Vehículos',''],rows.map(x=>`<tr><td>${esc(x.nombre)} ${esc(x.apellido)}</td><td>${esc(x.telefono)}</td><td>${esc(x.correo)}</td><td><button type="button" class="link-button detail" data-id="${x.cliente_id}">Ver</button></td><td><button type="button" class="link-button edit" data-id="${x.cliente_id}">Editar</button></td></tr>`))}</article>`;document.querySelector('#add').onclick=()=>clientForm();document.querySelectorAll('.edit').forEach(b=>b.onclick=()=>clientForm(rows.find(x=>x.cliente_id==b.dataset.id)));document.querySelectorAll('.detail').forEach(b=>b.onclick=async()=>{const x=await get('/clientes/'+b.dataset.id);notice(`Vehículos de ${x.nombre} ${x.apellido}: ${x.vehiculos.length?x.vehiculos.map(v=>v.placa).join(', '):'ninguno'}`)})}
async function vehicles(){const rows=await get('/vehiculos');content.innerHTML=`<article class="panel"><div class="panel-title"><h2>Vehículos</h2><button type="button" class="submit" id="add">+ Registrar vehículo</button></div>${table(['Placa','Cliente','Tipo','Marca / modelo','Año',''],rows.map(x=>`<tr><td><b>${esc(x.placa)}</b></td><td>${esc(x.cliente)}</td><td>${esc(x.tipo_vehiculo)}</td><td>${esc(x.marca)} ${esc(x.modelo)}</td><td>${esc(x.anio)}</td><td><button type="button" class="link-button edit" data-id="${x.vehiculo_id}">Editar</button></td></tr>`))}</article>`;document.querySelector('#add').onclick=()=>vehicleForm();document.querySelectorAll('.edit').forEach(b=>b.onclick=()=>vehicleForm(rows.find(x=>x.vehiculo_id==b.dataset.id)))}
async function spaces(){const rows=await get('/espacios');content.innerHTML=`<article class="panel"><div class="panel-title"><h2>Espacios</h2><button type="button" class="submit" id="add">+ Crear espacio</button></div>${table(['Código','Zona','Tipo','Estado',''],rows.map(x=>`<tr><td><b>${esc(x.codigo)}</b></td><td>${esc(x.zona)}</td><td>${esc(x.tipo_vehiculo)}</td><td>${badge(x.estado)}</td><td><button type="button" class="link-button edit" data-id="${x.espacio_id}">Editar</button></td></tr>`))}</article>`;document.querySelector('#add').onclick=()=>spaceForm();document.querySelectorAll('.edit').forEach(b=>b.onclick=()=>spaceForm(rows.find(x=>x.espacio_id==b.dataset.id)))}
async function stays(){content.innerHTML=`<article class="panel"><div class="panel-title"><h2>Historial de estadías</h2><div class="filters"><select id="period"><option value="hoy">Hoy</option><option value="ayer">Ayer</option><option value="fecha">Fecha específica</option><option value="rango">Desde / hasta</option><option value="todas">Todas</option></select><input id="specificDate" type="date" title="Fecha específica"><input id="fromDate" type="date" title="Desde"><input id="toDate" type="date" title="Hasta"><button type="button" class="secondary" id="filter">Filtrar</button></div></div><div id="stayTable"><p class="empty">Cargando…</p></div></article>`;async function load(){const period=document.querySelector('#period').value,params=new URLSearchParams();if(period==='fecha')params.set('fecha',document.querySelector('#specificDate').value);else if(period==='rango'){params.set('desde',document.querySelector('#fromDate').value);params.set('hasta',document.querySelector('#toDate').value)}else if(period!=='todas')params.set('periodo',period);const rows=await get('/estadias'+(params.toString()?`?${params}`:''));document.querySelector('#stayTable').innerHTML=table(['ID','Cliente / placa','Ubicación','Entrada','Salida','Duración','Tarifa','Total','Estado'],rows.map(x=>`<tr><td>#${x.estadia_id}</td><td>${esc(x.cliente)}<br><small>${esc(x.placa)} · ${esc(x.tipo_vehiculo)}</small></td><td>${esc(x.zona)} · ${esc(x.espacio)}</td><td>${date(x.fecha_entrada)}</td><td>${date(x.fecha_salida)}</td><td>${x.duracion_minutos??'—'} min</td><td>${money(x.precio_hora)}</td><td>${money(x.total)}</td><td>${badge(x.estado)}</td></tr>`))}document.querySelector('#period').onchange=load;document.querySelector('#filter').onclick=load;load()}
async function payments(){const rows=await get('/pagos');content.innerHTML=`<article class="panel"><h2>Pagos registrados</h2>${table(['Pago','Estadía','Placa','Método','Monto','Fecha'],rows.map(x=>`<tr><td>#${x.pago_id}</td><td>#${x.estadia_id}</td><td>${esc(x.placa)}</td><td>${esc(x.metodo_pago)}</td><td>${money(x.monto)}</td><td>${date(x.fecha_pago)}</td></tr>`))}</article>`}
async function reports(){
    const paths=['ocupacion','ingresos','ingresos-metodo','vehiculos-tipo','estadias-estado'],names=['A. Ocupación','B. Ingresos generales','C. Ingresos por método','D. Vehículos por tipo','E. Estadías por estado'];
    const data=await Promise.all(paths.map(p=>get('/reportes/'+p)));
    const make=(name,rows)=>`<article class="panel"><h2>${name}</h2>${table(Object.keys(rows[0]||{}),rows.map(r=>`<tr>${Object.values(r).map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`))}</article>`;
    const currentMonth=localDateTimeValue().slice(0,7);
    content.innerHTML=`<div class="report-grid">${data.map((x,i)=>make(names[i],x)).join('')}<article class="panel"><h2>F. Ingresos del mes</h2><label for="reportMonth">Mes</label><input type="month" id="reportMonth" value="${currentMonth}"><div id="monthlyIncome"><p class="empty">Cargando…</p></div></article></div>`;
    const loadMonthlyIncome=async()=>{
        const month=document.querySelector('#reportMonth').value;
        const rows=await get(`/reportes/ingresos-mes?mes=${encodeURIComponent(month)}`);
        const total=rows.reduce((sum,row)=>sum+Number(row.ingresos_totales||0),0);
        document.querySelector('#monthlyIncome').innerHTML=`<p><strong>${esc(reportMonth(month))}</strong></p>${table(['Fecha','Pagos','Ingresos'],rows.map(row=>`<tr><td>${esc(reportDate(row.fecha))}</td><td>${esc(row.cantidad_pagos)}</td><td>${money(row.ingresos_totales)}</td></tr>`))}<p><strong>Total mensual: ${money(total)}</strong></p>`;
    };
    document.querySelector('#reportMonth').onchange=()=>loadMonthlyIncome().catch(error=>notice(error.message,'error'));
    await loadMonthlyIncome();
}
const views = {
    dashboard: dashboard,
    entrada: entrada,
    salida: salida,
    clientes: clients,
    vehiculos: vehicles,
    espacios: spaces,
    estadias: stays,
    pagos: payments,
    reportes: reports
};
async function show(view){clearNotice();const render=views[view];if(typeof render!=='function'){console.error('Vista no disponible:',view);return}document.querySelector('#title').textContent=titles[view]||'ParkControl';content.innerHTML='<p class="empty">Cargando información…</p>';try{await render()}catch(e){console.error('Error al cargar la vista:',e);content.innerHTML=`<article class="panel"><h2>No fue posible cargar los datos</h2><p class="empty">${esc(e.message)}</p></article>`}}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{document.querySelector('#nav .active')?.classList.remove('active');b.classList.add('active');show(b.dataset.view)});show('dashboard');
