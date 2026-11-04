# Harness Studio

Aplicación web frontend para el diseño visual de arneses eléctricos automotrices. Permite crear conectores con su matriz de pines, colocarlos en un lienzo, unir sus pines con chicotes y visualizar el arnés en una vista de layout con haces y ramificaciones.

Stack: **HTML5 + CSS3 + JavaScript (ES6+) + Konva.js (Canvas 2D)**. No requiere build, servidor ni instalación de dependencias: Konva está incluido localmente en `js/vendor/`.

## Cómo abrir

Abre `index.html` directamente en Chrome, Edge o Firefox (doble clic). Todo el estado se guarda automáticamente en `localStorage` del navegador.

Consejo: si quieres servir la carpeta por HTTP (opcional):

```bash
npx serve .
# o
python -m http.server 8080
```

## Funcionalidades

### 1. Interfaz
- Barra superior con **Agregar Componente**, cambio de vista **Esquema / Layout**, **Auto-organizar**, zoom, guardar, importar/exportar JSON, exportar PNG y proyecto nuevo.
- Panel izquierdo con la **biblioteca** de conectores (miniatura de la foto, nombre, compañía, pines y costo). Se puede buscar, arrastrar al lienzo o insertar con doble clic. Cada tarjeta permite editar o eliminar la definición.
- Lienzo con **zoom** (rueda del ratón), **paneo** (arrastrar el fondo) y **cuadrícula adaptativa**.
- Panel derecho con **propiedades**, **medición de distancia opcional**, escala mm/px y **resumen del arnés** (componentes, chicotes, ramificaciones, longitud manual total y costo de conectores).

### 2. Creación de componentes (modal)
- Nombre, compañía, costo y **foto** (FileReader → DataURL, redimensionada a 560 px para ahorrar espacio).
- Uno o varios **subgrupos** de pines, cada uno con filas, columnas, tipo de numeración, prefijo y valor inicial:
  - Numérica (`1, 2, 3…`)
  - Alfabética (`A, B, C…`)
  - Fila + número (`A1, A2…`)
  - Columna + número (`A1, B1…`)
  - Prefijo + número (`J1, J2…`)
- **Texto libre por pin** (opcional): debajo de cada subgrupo hay una lista con el número de pin y un campo para escribir su función o señal (`GND`, `5V`, `CAN H`, `INJ 1`, etc.).
- **Vista previa en vivo** de la matriz: cada celda se convierte en un punto de anclaje en el lienzo.
- Al editar una definición se actualizan todas sus instancias; las conexiones cuyos pines dejaron de existir se eliminan avisando al usuario.

### 3. Vista Esquema
- Arrastrar componentes por el lienzo con actualización en tiempo real de los chicotes.
- Cada componente muestra foto, nombre, compañía, costo y la matriz de pines por subgrupo. Los pines conectados se resaltan en verde y muestran su **texto descriptivo** debajo del número; al pasar el cursor aparece un tooltip con la descripción completa.
- **Selección**: cada componente, pin, chicote y haz/ramificación seleccionado se resalta con un contorno azul; la barra de estado indica qué elemento está seleccionado. Un clic sobre el fondo o `Esc` limpia la selección.
- **Crear chicote**: hacer clic sobre un pin y arrastrar hasta otro pin. Cada pin posee un área de impacto amplia (incluye su número y su texto) para que no se mueva el componente al pulsarlo. Se muestra una línea temporal y un resaltado del pin destino. Validación estricta **1 a 1** (un pin no acepta más de un chicote).
- **Ruteo editable**: doble clic sobre un cable agrega un punto de control; al seleccionar un cable aparecen manejadores arrastrables para crear curvas y dobleces. El botón *Restablecer ruteo* vuelve al ruteo automático ortogonal.
- Propiedades del chicote: origen, destino, color, **longitud manual en mm** y eliminación.

### 4. Vista Layout
- Los mismos componentes se muestran como tarjetas simplificadas (foto, nombre, compañía y nº de pines) en posiciones de layout independientes de la vista esquema.
- Los cables se agrupan en **haces** por par de componentes. El grosor del haz crece con el número de cables y la etiqueta muestra la cantidad y la **suma de longitudes manuales** (`n× · mm`).
- **Longitudes representativas, no escaladas**: la aplicación no calcula distancias desde el lienzo. La longitud se escribe a mano por chicote o para todo el haz (panel Propiedades o doble clic sobre el haz). Las ramificaciones también tienen su propia longitud manual.
- **Punto medio móvil**: arrastra el círculo del punto medio de un haz para cambiar su recorrido (el haz se convierte en una línea con doblez). La posición se guarda en el proyecto.
- **Unir haces**: arrastra el punto medio de un haz y suéltalo sobre otro haz o sobre su punto medio; ambos pasan a compartir un **punto de unión** (se muestra un anillo azul) sin perder la conexión con sus componentes. Puedes unir más de dos haces repitiendo la operación. El botón *Quitar unión* del panel Propiedades devuelve un haz a su punto medio recto.
- **Ramificaciones**: arrastra el punto medio de un haz (o de una unión) y suéltalo sobre un componente para crear una derivación anclada a ese punto; se dibuja hasta el componente destino y muestra su longitud manual. Si mueves el punto de unión, las ramificaciones ancladas lo siguen.
- *Auto-organizar* distribuye los componentes en columnas según la conectividad (BFS).
- Al seleccionar un haz se listan todos sus cables con colores y longitudes manuales, el punto de unión y cuántos haces están unidos.

### 5. Medición de distancia (opcional)
- Botón **Medir (2 clics)**: selecciona dos pines (vista esquema) o dos tarjetas (cualquier vista) y escribe el resultado en el campo de texto **Distancia entre elementos** con formato `N px · N mm`.
- La escala (`1 px = X mm`) solo afecta a esta herramienta de medición puntual; **no** se usa para las longitudes del layout ni para el resumen del arnés.

### 6. Persistencia y exportación
- Guardado automático (debounce) en `localStorage`.
- Exportar/Importar JSON completo del proyecto.
- Exportar PNG del lienzo de la vista activa.
- Proyecto de ejemplo disponible desde el estado vacío para ver todas las funciones.

## Atajos de teclado
| Tecla | Acción |
| --- | --- |
| `Supr` / `Backspace` | Elimina la selección (componente, chicote, haz o ramificación) |
| `Ctrl/Cmd + S` | Guarda inmediatamente |
| `Esc` | Cancela la creación de un chicote, una ramificación o la medición; si no hay acción en curso, limpia la selección |
| Doble clic en haz/ramificación | Edita su longitud manual en mm (vista layout) |
| Arrastrar punto medio (layout) | Mueve el punto del haz; suéltalo sobre otro haz para unirlos o sobre un componente para ramificar |
| Rueda del ratón | Zoom sobre el cursor |
| Arrastrar fondo | Paneo del lienzo |

## Estructura del proyecto

```
index.html                 Estructura de la interfaz y modal
css/styles.css             Estilos (tema claro, layout responsive)
js/utils.js                Utilidades, generación de pines, geometría e imágenes
js/hit-test.js             Detección de impactos por geometría (compatible con Brave)
js/store.js                Modelo de datos, validaciones, persistencia e import/export
js/component-modal.js      Alta/edición de conectores y matriz de pines
js/library.js              Biblioteca lateral y drag & drop
js/schema-view.js          Vista esquema en Konva (componentes, pines, chicotes)
js/layout-view.js          Vista layout (haces, longitudes y ramificaciones)
js/measure.js              Herramienta de medición y overlay
js/inspector.js            Propiedades, resumen y acciones
js/app.js                  Stage, capas, toolbar, zoom/paneo, atajos
js/vendor/konva.min.js     Konva.js 9.3.16 (local)
```

## Modelo de datos (JSON exportado)

```json
{
  "app": "Harness Studio",
  "version": 1,
  "meta": { "name": "Arnés sin título", "createdAt": 0, "updatedAt": 0 },
  "settings": { "mmPerPx": 1, "showGrid": true },
  "view": { "mode": "schema", "scale": 1, "x": 40, "y": 40 },
  "library": [
    {
      "id": "def_1",
      "name": "ECU Motor",
      "company": "Bosch",
      "cost": 48.5,
      "image": "data:image/jpeg;base64,...",
      "subgroups": [
        { "id": "sg_a", "name": "Sección A", "rows": 2, "cols": 4,
          "numbering": "numeric", "prefix": "", "start": 1,
          "descriptions": { "sg_a_r1c1": "GND", "sg_a_r1c2": "5V" },
          "pins": [ { "id": "sg_a_r1c1", "label": "1", "row": 1, "col": 1, "description": "GND" } ] }
      ],
      "pins": [ { "id": "sg_a_r1c1", "label": "1", "description": "GND", "subgroup": "Sección A" } ]
    }
  ],
  "components": [
    { "id": "comp_1", "defId": "def_1", "x": 100, "y": 100, "layoutX": 120, "layoutY": 150 }
  ],
  "wires": [
    {
      "id": "wire_1",
      "fromPinId": "comp_1|sg_a_r1c1",
      "toPinId": "comp_2|sg_a_r1c2",
      "color": "#ef4444",
      "length": 320,
      "points": []
    }
  ],
  "branches": [
    {
      "id": "branch_1",
      "fromCompId": "comp_1",
      "toCompId": "comp_2",
      "targetCompId": "comp_3",
      "t": 0.55,
      "color": "#475569",
      "length": 260,
      "atMidpoint": true
    }
  ],
  "routes": {
    "comp_1|comp_2": { "x": 420, "y": 120 }
  }
}
```

- `components` guarda solo la instancia y su posición; los datos del conector se leen de `library` mediante `defId`.
- El identificador de un pin conectado es `compId|pinId`.
- `library[].subgroups[].descriptions` y `pins[].description` guardan el **texto libre de cada pin** (por ejemplo `GND`, `5V`).
- `wires[].length` y `branches[].length` son **longitudes manuales en milímetros** (valores representativos). No se calculan a partir de la geometría del lienzo; `0` significa “sin longitud definida” y se muestra como `— mm`.
- `wires[].points` vacío significa ruteo automático; si contiene puntos, son coordenadas absolutas del lienzo (los extremos siempre siguen a los pines).
- `branches[].t` es la posición relativa (0–1) sobre el haz; `branches[].atMidpoint: true` ancla la ramificación al punto de unión del haz.
- `routes` guarda el **punto medio/doblez** de cada haz usando como clave el `bundleKey` (`compA|compB` ordenado). Dos o más haces con exactamente el mismo punto están **unidos** en ese nodo.

## Notas y limitaciones
- La conexión es **1 a 1** por pin; las derivaciones se modelan como ramificaciones desde un haz en la vista layout.
- Las longitudes del layout son **manuales/representativas**; la herramienta de medición (px/mm) es independiente y opcional.
- La selección y el arrastre no dependen del canvas de hit de Konva (`getImageData`): se resuelven por geometría en `js/hit-test.js`, por lo que funcionan igual en Chrome, Edge y **Brave** aunque esté activa la protección de huella digital.
- Las fotos se guardan como DataURL dentro del JSON/localStorage; imágenes muy grandes pueden agotar la cuota del navegador (se avisa y se puede usar Exportar JSON).
- Las definiciones se comparten entre instancias: editar un conector cambia todas sus copias en el lienzo.
- Validado en Chrome/Edge headless con eventos de ratón reales y **lectura de canvas alterada** (simulando Brave): selección de pines/componentes/haces/ramificaciones sin mover el componente, arrastre, zoom, conexión por arrastre, textos de pines, punto medio móvil, unión de haces, ramificaciones ancladas, longitudes manuales, persistencia e import/export.
