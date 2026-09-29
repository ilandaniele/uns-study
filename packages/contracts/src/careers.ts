/**
 * Undergraduate (grado) and pregrado (tecnicaturas) programs of the Universidad Nacional del Sur,
 * grouped by Departamento académico. Data only — used to populate the profile "Carrera" dropdown.
 *
 * Sources (official UNS, retrieved 2026-09-29):
 * - https://www.uns.edu.ar/ingreso/carreras/carreras-oferta
 *   ("Carreras de grado dictadas en la Universidad Nacional del Sur", ingreso 1º cuatrimestre 2027)
 * - https://servicios.uns.edu.ar/grado/menu_all.asp (Carreras de Grado, por carrera/departamento)
 *
 * The list follows the current offer page (66 programs) plus Medicina (Ciencias de la Salud), which
 * has its own admission and is listed on the catalogue and in the offer page's PEUZO note. Programs that only appear on the older catalogue
 * (e.g. closed tecnicaturas) are not included. Anything missing can still be typed via "Otra".
 */

export interface UnsCareer {
  /** Stable slug. */
  id: string;
  /** Official name, in sentence case with accents. */
  name: string;
  /** Departamento académico that administers it. */
  department: UnsDepartment;
}

export const UNS_DEPARTMENTS = [
  "Agronomía",
  "Biología, Bioquímica y Farmacia",
  "Ciencias de la Administración",
  "Ciencias de la Educación",
  "Ciencias de la Salud",
  "Ciencias e Ingeniería de la Computación",
  "Derecho",
  "Economía",
  "Física",
  "Geografía y Turismo",
  "Geología",
  "Humanidades",
  "Ingeniería",
  "Ingeniería Eléctrica y de Computadoras",
  "Ingeniería Química",
  "Matemática",
  "Química",
] as const;

export type UnsDepartment = (typeof UNS_DEPARTMENTS)[number];

const c = (id: string, name: string, department: UnsDepartment): UnsCareer => ({ id, name, department });

export const UNS_CAREERS: readonly UnsCareer[] = [
  // Agronomía
  c("ingenieria-agronomica", "Ingeniería Agronómica", "Agronomía"),
  c("tec-suelos-y-aguas", "Tecnicatura Superior Agraria en Suelos y Aguas", "Agronomía"),
  c("tec-parques-y-jardines", "Tecnicatura Universitaria en Parques y Jardines", "Agronomía"),

  // Biología, Bioquímica y Farmacia
  c("bioquimica", "Bioquímica", "Biología, Bioquímica y Farmacia"),
  c("farmacia", "Farmacia", "Biología, Bioquímica y Farmacia"),
  c("lic-ciencias-biologicas", "Licenciatura en Ciencias Biológicas", "Biología, Bioquímica y Farmacia"),
  c("prof-ciencias-biologicas", "Profesorado en Ciencias Biológicas", "Biología, Bioquímica y Farmacia"),

  // Ciencias de la Administración
  c("contador-publico", "Contador Público", "Ciencias de la Administración"),
  c("lic-administracion", "Licenciatura en Administración", "Ciencias de la Administración"),
  c(
    "prof-secundaria-ciencias-administracion",
    "Profesorado en Educación Secundaria en Ciencias de la Administración",
    "Ciencias de la Administración",
  ),
  c(
    "prof-secundaria-superior-ciencias-administracion",
    "Profesorado en Educación Secundaria y Superior en Ciencias de la Administración",
    "Ciencias de la Administración",
  ),

  // Ciencias de la Educación
  c("lic-ciencias-educacion", "Licenciatura en Ciencias de la Educación", "Ciencias de la Educación"),
  c("prof-educacion-inicial", "Profesorado de Educación Inicial", "Ciencias de la Educación"),
  c("prof-educacion-primaria", "Profesorado de Educación Primaria", "Ciencias de la Educación"),

  // Ciencias de la Salud
  c("medicina", "Medicina", "Ciencias de la Salud"),
  c("lic-enfermeria", "Licenciatura en Enfermería", "Ciencias de la Salud"),
  c("lic-obstetricia", "Licenciatura en Obstetricia", "Ciencias de la Salud"),
  c("tec-acompanamiento-terapeutico", "Tecnicatura Universitaria en Acompañamiento Terapéutico", "Ciencias de la Salud"),

  // Ciencias e Ingeniería de la Computación
  c("ingenieria-computacion", "Ingeniería en Computación", "Ciencias e Ingeniería de la Computación"),
  c("ingenieria-sistemas-informacion", "Ingeniería en Sistemas de Información", "Ciencias e Ingeniería de la Computación"),
  c("lic-ciencias-computacion", "Licenciatura en Ciencias de la Computación", "Ciencias e Ingeniería de la Computación"),
  c("tec-programacion-web-movil", "Tecnicatura Universitaria en Programación Web y Móvil", "Ciencias e Ingeniería de la Computación"),

  // Derecho
  c("abogacia", "Abogacía", "Derecho"),
  c("lic-seguridad-publica", "Licenciatura en Seguridad Pública", "Derecho"),

  // Economía
  c("lic-economia", "Licenciatura en Economía", "Economía"),
  c("prof-economia", "Profesorado en Economía", "Economía"),
  c("prof-economia-secundaria", "Profesorado en Economía para la Enseñanza Secundaria", "Economía"),

  // Física
  c("lic-fisica", "Licenciatura en Física", "Física"),
  c("lic-geofisica", "Licenciatura en Geofísica", "Física"),
  c("lic-optica-contactologia", "Licenciatura en Óptica y Contactología", "Física"),
  c("prof-fisica", "Profesorado en Física", "Física"),
  c("tec-optica", "Tecnicatura Universitaria en Óptica", "Física"),

  // Geografía y Turismo
  c("arquitectura", "Arquitectura", "Geografía y Turismo"),
  c("lic-geografia", "Licenciatura en Geografía", "Geografía y Turismo"),
  c("lic-oceanografia", "Licenciatura en Oceanografía", "Geografía y Turismo"),
  c("lic-turismo", "Licenciatura en Turismo", "Geografía y Turismo"),
  c("prof-geografia", "Profesorado Universitario en Geografía", "Geografía y Turismo"),
  c(
    "tec-cartografia-teledeteccion-sig",
    "Tecnicatura Universitaria en Cartografía, Teledetección y Sistemas de Información Geográfica",
    "Geografía y Turismo",
  ),
  c("tec-oceanografia", "Tecnicatura Universitaria en Oceanografía", "Geografía y Turismo"),

  // Geología
  c("lic-ciencias-geologicas", "Licenciatura en Ciencias Geológicas", "Geología"),
  c("prof-geociencias", "Profesorado en Geociencias", "Geología"),
  c("tec-medio-ambiente", "Tecnicatura Universitaria en Medio Ambiente", "Geología"),

  // Humanidades
  c("lic-filosofia", "Licenciatura en Filosofía", "Humanidades"),
  c("lic-historia", "Licenciatura en Historia", "Humanidades"),
  c("lic-letras", "Licenciatura en Letras", "Humanidades"),
  c("prof-filosofia", "Profesorado en Filosofía", "Humanidades"),
  c("prof-historia", "Profesorado en Historia", "Humanidades"),
  c("prof-letras", "Profesorado en Letras", "Humanidades"),

  // Ingeniería
  c("agrimensura", "Agrimensura", "Ingeniería"),
  c("ingenieria-civil", "Ingeniería Civil", "Ingeniería"),
  c("ingenieria-industrial", "Ingeniería Industrial", "Ingeniería"),
  c("ingenieria-mecanica", "Ingeniería Mecánica", "Ingeniería"),

  // Ingeniería Eléctrica y de Computadoras
  c("ingenieria-electricista", "Ingeniería Electricista", "Ingeniería Eléctrica y de Computadoras"),
  c("ingenieria-electronica", "Ingeniería Electrónica", "Ingeniería Eléctrica y de Computadoras"),
  c("ingenieria-telecomunicaciones", "Ingeniería en Telecomunicaciones", "Ingeniería Eléctrica y de Computadoras"),
  c(
    "tec-sistemas-electronicos-industriales",
    "Tecnicatura Universitaria en Sistemas Electrónicos Industriales Inteligentes",
    "Ingeniería Eléctrica y de Computadoras",
  ),

  // Ingeniería Química
  c("ingenieria-alimentos", "Ingeniería en Alimentos", "Ingeniería Química"),
  c("ingenieria-quimica", "Ingeniería Química", "Ingeniería Química"),
  c("tec-operaciones-industriales", "Tecnicatura Universitaria en Operaciones Industriales", "Ingeniería Química"),
  c("tec-petroleo-gas", "Tecnicatura Universitaria en Petróleo y Gas", "Ingeniería Química"),

  // Matemática
  c("lic-matematica", "Licenciatura en Matemática", "Matemática"),
  c("lic-matematica-aplicada", "Licenciatura en Matemática Aplicada", "Matemática"),
  c("prof-matematica", "Profesorado en Matemática", "Matemática"),

  // Química
  c("lic-ciencias-ambientales", "Licenciatura en Ciencias Ambientales", "Química"),
  c("lic-quimica", "Licenciatura en Química", "Química"),
  c("prof-quimica", "Profesorado en Química", "Química"),
  c("prof-quimica-ensenanza-media", "Profesorado en Química de la Enseñanza Media", "Química"),
];

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Finds a career by name, ignoring case, accents and extra whitespace. */
export function findUnsCareerByName(name: string | null | undefined): UnsCareer | undefined {
  if (!name) return undefined;
  const key = normalize(name);
  return UNS_CAREERS.find((career) => normalize(career.name) === key);
}

/** Careers grouped by department, in `UNS_DEPARTMENTS` order (for `<optgroup>` rendering). */
export function unsCareersByDepartment(): { department: UnsDepartment; careers: UnsCareer[] }[] {
  return UNS_DEPARTMENTS.map((department) => ({
    department,
    careers: UNS_CAREERS.filter((career) => career.department === department),
  }));
}
