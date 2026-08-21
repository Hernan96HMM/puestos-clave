-- 1. Sectores (12 total; the source doc's "11 sectores" is a typo — it lists 12).
insert into sector (nombre, slug, orden) values
('Admin. y Finanzas', 'admin-y-finanzas', 1),
('Compras', 'compras', 2),
('Comercial', 'comercial', 3),
('Control de Calidad', 'control-de-calidad', 4),
('Ingeniería', 'ingenieria', 5),
('Mantenimiento', 'mantenimiento', 6),
('Obras', 'obras', 7),
('Planificación Operativa', 'planificacion-operativa', 8),
('Radiología', 'radiologia', 9),
('Recursos Humanos', 'recursos-humanos', 10),
('SIG y Medio Ambiente', 'sig-y-medio-ambiente', 11),
('Almacenes', 'almacenes', 12);

-- 2. Puestos (76 total, exact names/order from the source doc).
insert into puesto (sector_id, nombre, orden)
select s.id, v.nombre, v.orden
from (values
  ('admin-y-finanzas', 'Responsable de Administración', 1),
  ('admin-y-finanzas', 'Contador Sr.', 2),
  ('admin-y-finanzas', 'Encargada de Facturación y Cobranza', 3),
  ('admin-y-finanzas', 'Encargado de Tesorería', 4),
  ('admin-y-finanzas', 'Auxiliar de Administración', 5),
  ('admin-y-finanzas', 'Auxiliar de Administración 2', 6),

  ('compras', 'Comprador Sr.', 1),
  ('compras', 'Comprador Jr.', 2),

  ('comercial', 'Responsable Comercial Unidad de Negocios Oil & Gas', 1),
  ('comercial', 'Responsable Comercial Unidad de Negocios GLP y Gases del Aire', 2),
  ('comercial', 'Ingeniero Comercial Unidad de Negocios Internacionales', 3),
  ('comercial', 'Ing. de Presupuesto', 4),
  ('comercial', 'Encargado de Presupuesto', 5),
  ('comercial', 'Analista de Comercial y Presupuesto', 6),

  ('control-de-calidad', 'Responsable Control de Calidad', 1),
  ('control-de-calidad', 'Asistente Administrativo Calidad', 2),
  ('control-de-calidad', 'Inspector de Soldadura', 3),
  ('control-de-calidad', 'Inspector Senior', 4),
  ('control-de-calidad', 'Inspector Semi Senior', 5),
  ('control-de-calidad', 'Inspector Junior', 6),
  ('control-de-calidad', 'Inspector Talleres externos', 7),
  ('control-de-calidad', 'Responsable de Radiología (N2)', 8),
  ('control-de-calidad', 'Radiólogo (N1)', 9),
  ('control-de-calidad', 'Operador autorizado', 10),
  ('control-de-calidad', 'Ayudante de Radiología', 11),

  ('ingenieria', 'Responsable de diseño mecánico y de equipos móviles', 1),
  ('ingenieria', 'Responsable de ingeniería de obras', 2),
  ('ingenieria', 'Responsable de Instrumentación y Electricidad', 3),
  ('ingenieria', 'Responsable de Ingeniería de Equipos Oil & Gas y Especiales', 4),
  ('ingenieria', 'Proyectista Senior', 5),
  ('ingenieria', 'Instrumentista industrial', 6),
  ('ingenieria', 'Ingeniero de Procesos', 7),
  ('ingenieria', 'Proyectista Sr.', 8),
  ('ingenieria', 'Asistente de Documentación', 9),
  ('ingenieria', 'Auxiliar de Instrumentación', 10),

  ('mantenimiento', 'Auxiliar Administrativo de Mantenimiento - Senior', 1),
  ('mantenimiento', 'Auxiliar Administrativo de Mantenimiento - Junior', 2),
  ('mantenimiento', 'Mantenimiento Eléctrico', 3),
  ('mantenimiento', 'Mantenimiento Mecánico de Vehículo', 4),
  ('mantenimiento', 'Mantenimiento Mecánico', 5),
  ('mantenimiento', 'Tornero', 6),
  ('mantenimiento', 'Operario de Mantenimiento electromecánico', 7),

  ('obras', 'Coordinador de Obras', 1),
  ('obras', 'Operario Calificado de Obras', 2),
  ('obras', 'Ayudante Calificado de Obras', 3),

  ('planificacion-operativa', 'Jefe Calderería', 1),
  ('planificacion-operativa', 'Jefe de Pintura y Montaje', 2),
  ('planificacion-operativa', 'Encargado de Producción de Equipos móviles', 3),
  ('planificacion-operativa', 'Encargado de Tanques en serie', 4),
  ('planificacion-operativa', 'Encargado de Obras', 5),
  ('planificacion-operativa', 'Encargado de Mantenimiento Mecánico y Eléctrico', 6),
  ('planificacion-operativa', 'Auxiliar Administrativo de Mantenimiento', 7),
  ('planificacion-operativa', 'Auxiliar Administrativo de Producción', 8),
  ('planificacion-operativa', 'Analista Programador Cortes', 9),
  ('planificacion-operativa', 'Encargado de Almacenes', 10),
  ('planificacion-operativa', 'Líder de Proyecto', 11),

  ('radiologia', 'Radiólogo (N1)', 1),
  ('radiologia', 'Operador autorizado', 2),
  ('radiologia', 'Ayudante de Radiología', 3),

  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 1),
  ('recursos-humanos', 'Generalista de Recursos Humanos', 2),
  ('recursos-humanos', 'Encargado de Guardia', 3),
  ('recursos-humanos', 'Personal de Guardia (Turnos rotativos)', 4),
  ('recursos-humanos', 'Personal de Maestranza', 5),

  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 1),
  ('sig-y-medio-ambiente', 'Asistente de Higiene y Seguridad Ocupacional', 2),
  ('sig-y-medio-ambiente', 'Responsable externo de Higiene y seguridad ocupacional', 3),
  ('sig-y-medio-ambiente', 'Asistente de Sistema Informático', 4),
  ('sig-y-medio-ambiente', 'Analista Funcional de Sistema informático', 5),
  ('sig-y-medio-ambiente', 'Responsable de Medicina Laboral', 6),
  ('sig-y-medio-ambiente', 'Servicio Médico de la Empresa', 7),
  ('sig-y-medio-ambiente', 'Servicio Medio Ambiental', 8),

  ('almacenes', 'Responsable de Almacenes', 1),
  ('almacenes', 'Auxiliar de Recepción de Materiales', 2),
  ('almacenes', 'Auxiliar Operativo de Almacén', 3),
  ('almacenes', 'Servicio de Cadetería', 4)
) as v(sector_slug, nombre, orden)
join sector s on s.slug = v.sector_slug;

-- 3. Banco de preguntas (10 fijas, peso suma 100).
insert into pregunta (numero, texto, ref_iso, peso_pct) values
(1, 'Impacto del puesto en la toma de decisiones y en los resultados (financieros, de procesos o de clima laboral).', '5.1.1 / 9.1.3', 12),
(2, 'Nivel de criticidad del rol: dependencia de otras áreas y capacidad de destrabar procesos.', '4.4 / 8.1', 12),
(3, 'Complejidad y tiempo de aprendizaje del conocimiento requerido (escasez en el mercado, curva de aprendizaje).', '7.1.6', 12),
(4, 'Impacto estratégico en el negocio: incidencia directa en clientes, costos o resultados.', '5.1.1 / 6.1', 10),
(5, 'Valor agregado de las competencias específicas del puesto al proceso.', '7.2', 8),
(6, 'Alineación con el futuro del negocio (digitalización, profesionalización, expansión).', '6.3', 8),
(7, 'Disponibilidad de reemplazo interno o polivalencia para cubrir el puesto.', '7.1.2', 10),
(8, 'Riesgo de impacto operativo inmediato ante una ausencia o desvinculación inesperada.', '6.1', 10),
(9, 'Requiere una matrícula profesional, certificación técnica o habilitación específica que no cualquier persona del mercado posee.', '7.2 / 8.1', 10),
(10, 'Interactúa con partes interesadas externas críticas (clientes, proveedores estratégicos, organismos de control) cuya gestión inadecuada afecta el cumplimiento o la relación.', '4.2 / 9.2', 8);

-- 4. Evaluaciones: una por puesto, en blanco.
insert into evaluacion (puesto_id)
select id from puesto;

-- 5. Respuesta_pregunta: una por (evaluacion, pregunta global), puntaje en blanco
-- (null = N/A hasta que se responda). Solo las preguntas globales (puesto_id is
-- null) van acá — las preguntas de puesto (agregadas después, en runtime, con
-- "Nueva pregunta") ya nacen con su propia fila via crearPreguntaPuestoAction,
-- no deben duplicarse para el resto de los puestos.
insert into respuesta_pregunta (evaluacion_id, pregunta_id)
select e.id, pr.id
from evaluacion e
cross join pregunta pr
where pr.puesto_id is null;

-- 6. Datos históricos reales (5 puestos ya evaluados en los Excel de origen).
-- evaluador, fecha_evaluacion y justificacion quedan en null: así están en el
-- Excel real para estos 5 puestos, y la regla "justificación obligatoria si
-- puntaje >= 3" es una validación de aplicación, no una restricción de la base.
update respuesta_pregunta rp
set puntaje = rs.puntaje
from (values
  ('admin-y-finanzas', 'Encargado de Tesorería', 1, 5),
  ('admin-y-finanzas', 'Encargado de Tesorería', 2, 3),
  ('admin-y-finanzas', 'Encargado de Tesorería', 3, 4),
  ('admin-y-finanzas', 'Encargado de Tesorería', 4, 3),
  ('admin-y-finanzas', 'Encargado de Tesorería', 5, 1),
  ('admin-y-finanzas', 'Encargado de Tesorería', 6, 4),
  ('admin-y-finanzas', 'Encargado de Tesorería', 7, 5),
  ('admin-y-finanzas', 'Encargado de Tesorería', 8, 3),

  ('compras', 'Comprador Jr.', 1, 4),
  ('compras', 'Comprador Jr.', 2, 3),
  ('compras', 'Comprador Jr.', 3, 3),
  ('compras', 'Comprador Jr.', 4, 3),
  ('compras', 'Comprador Jr.', 5, 4),
  ('compras', 'Comprador Jr.', 6, 3),
  ('compras', 'Comprador Jr.', 7, 3),
  ('compras', 'Comprador Jr.', 8, 3),
  ('compras', 'Comprador Jr.', 9, 3),
  ('compras', 'Comprador Jr.', 10, 3),

  ('radiologia', 'Radiólogo (N1)', 1, 5),
  ('radiologia', 'Radiólogo (N1)', 2, 4),
  ('radiologia', 'Radiólogo (N1)', 3, 4),
  ('radiologia', 'Radiólogo (N1)', 4, 4),
  ('radiologia', 'Radiólogo (N1)', 5, 5),
  ('radiologia', 'Radiólogo (N1)', 6, 5),
  ('radiologia', 'Radiólogo (N1)', 7, 5),
  ('radiologia', 'Radiólogo (N1)', 8, 5),
  ('radiologia', 'Radiólogo (N1)', 9, 3),
  ('radiologia', 'Radiólogo (N1)', 10, 1),

  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 1, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 2, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 3, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 4, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 5, 5),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 6, 5),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 7, 5),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 8, 5),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 9, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 10, 4),

  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 1, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 2, 4),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 3, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 4, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 5, 4),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 6, 2),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 7, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 8, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 9, 4),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 10, 2)
) as rs(sector_slug, puesto_nombre, pregunta_numero, puntaje)
join sector s on s.slug = rs.sector_slug
join puesto p on p.sector_id = s.id and p.nombre = rs.puesto_nombre
join evaluacion e on e.puesto_id = p.id
join pregunta pr on pr.numero = rs.pregunta_numero
where rp.evaluacion_id = e.id and rp.pregunta_id = pr.id;

-- Cada evaluación necesita su fila en validacion_puesto (estado 'pendiente' por
-- defecto). El backfill de la migración 0005 corre antes de este seed en una
-- instalación limpia, así que ahí no hay evaluaciones que copiar; sin este
-- insert la tabla queda vacía y la acción de dirección nunca afecta filas.
-- Idempotente: el `where not exists` lo hace seguro en cualquier orden.
insert into validacion_puesto (evaluacion_id)
select id from evaluacion
where not exists (select 1 from validacion_puesto vp where vp.evaluacion_id = evaluacion.id);
