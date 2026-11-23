# REPORTE-PRODUCTIVO
### Sistema de Gestión de Errores, Ajustes y Mejoras de Producción

[![Aplicación Web](https://img.shields.io/badge/Aplicación-Web-blue)](https://javiera-sys.github.io/REPORTE-PRODUCTIVO/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Nativo-yellow)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-Estructura-orange)](https://developer.mozilla.org/es/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-Estilos-blue)](https://developer.mozilla.org/es/docs/Web/CSS)
[![Firebase](https://img.shields.io/badge/Firebase-Messaging-orange)](https://firebase.google.com/)

## 1. Descripción general

**REPORTE-PRODUCTIVO** es una aplicación web diseñada para administrar, documentar y dar seguimiento a errores de fabricación, ajustes de ingeniería y mejoras implementadas en los procesos de producción.

Su objetivo es centralizar la información técnica de los muebles, facilitar la comunicación entre áreas de trabajo y mantener un historial organizado de los cambios realizados.

La aplicación permite registrar incidencias, adjuntar evidencia fotográfica, administrar modelos, controlar estados de ejecución y sincronizar información mediante GitHub.

## 2. Arquitectura tecnológica

El proyecto utiliza una arquitectura web basada en tecnologías nativas, sin depender de un framework frontend principal.

| Tecnología | Aplicación |
|---|---|
| HTML5 | Estructura de interfaz y formularios |
| CSS3 | Diseño, estilos y adaptación responsive |
| JavaScript | Lógica de negocio y procesamiento |
| GitHub REST API | Sincronización y almacenamiento de archivos |
| Firebase Cloud Messaging | Notificaciones push |
| JSZip | Compresión y generación de archivos ZIP |
| SheetJS (XLSX) | Importación y exportación de Excel |
| html2pdf.js | Generación de documentos PDF |
| Apache ECharts | Visualización de estadísticas |
| Service Worker | Soporte de notificaciones y funciones PWA |

## 3. Estructura del repositorio

```text
REPORTE-PRODUCTIVO/
│
├── css/
│   └── styles.css
│
├── data/
│   ├── cambios.json
│   ├── modelos.json
│   ├── usuarios.json
│   └── images/
│
├── icons/
│
├── js/
│   ├── app.js
│   ├── usuarios.js
│   └── compartir.js
│
├── firebase-messaging-sw.js
├── index.html
├── manifest.json
└── README.md
```

*Nota: los archivos de datos y directorios mostrados representan la organización funcional del proyecto; su contenido puede variar conforme a las actualizaciones.*

## 4. Módulos funcionales

### 4.1. Gestión de errores y mejoras
- Registro de errores de fabricación.
- Clasificación de incidencias.
- Registro de ajustes y mejoras de ingeniería.
- Asociación de registros con modelos de muebles.
- Seguimiento de modificaciones.
- Evidencia fotográfica de los cambios.

### 4.2. Control de producción
- Administración por naves y áreas de trabajo.
- Seguimiento de procesos.
- Identificación de actividades pendientes.
- Control de registros terminados y cancelados.
- Validación de actividades según permisos.

### 4.3. Gestión de imágenes
- Carga de fotografías desde el dispositivo.
- Pegado de imágenes desde el portapapeles.
- Compresión mediante Canvas.
- Asociación de imágenes con muebles, adjuntos y rutas.
- Visualización y eliminación de fotografías.
- Almacenamiento de archivos independientes en `data/images/` durante la sincronización.

### 4.4. Dashboard y estadísticas
- Visualización de indicadores de producción.
- Conteo de pendientes, terminados y cancelados.
- Consulta de estadísticas.
- Generación de reportes PDF.

### 4.5. Procesos de diseño
- Administración de apartados técnicos.
- Importación de documentos Excel.
- Edición de tablas.
- Almacenamiento y consulta de documentos PDF.

### 4.6. Rutas y pendientes generales
- Registro de instrucciones de trabajo.
- Asociación de muebles relacionados.
- Evidencia fotográfica.
- Seguimiento de actividades.

### 4.7. Administración de usuarios
- Gestión de usuarios.
- Control de permisos.
- Identificación de modificaciones.
- Restricción de operaciones administrativas.

## 5. Sistema de almacenamiento y sincronización

La aplicación utiliza GitHub como repositorio central de información.

El procedimiento de sincronización contempla:

1. Recopilación de los datos modificados.
2. Identificación de imágenes y archivos nuevos.
3. Conversión de los archivos a Base64 para su transmisión mediante GitHub API.
4. Creación de archivos independientes dentro de `data/images/`.
5. Actualización de referencias en los datos JSON.
6. Creación de un árbol de archivos.
7. Generación de un commit agrupado.
8. Actualización de la rama correspondiente.

El sistema también contempla:
- Control de guardados simultáneos.
- Reintentos ante determinados conflictos.
- Respaldo local cuando no existe conexión.
- Sincronización posterior.

## 6. Aplicación web progresiva (PWA)

El proyecto incorpora `manifest.json` y un Service Worker para funcionalidades relacionadas con la instalación y las notificaciones.

Esto permite ofrecer una experiencia de uso desde dispositivos de escritorio y móviles.

## 7. Instalación y ejecución

### Requisitos
- Navegador web actualizado.
- Acceso a Internet para sincronización.
- Repositorio GitHub configurado.
- Token de acceso con los permisos necesarios para la API.

### Ejecución local

1. Clonar o descargar el repositorio.
2. Abrir el proyecto en un servidor web local.
3. Configurar los parámetros de GitHub desde la aplicación.
4. Verificar la configuración de Firebase para las notificaciones.
5. Acceder a `index.html`.

### Publicación

El proyecto está organizado para su publicación mediante GitHub Pages.

## 8. Dependencias externas

Las bibliotecas principales se cargan mediante CDN:

- Firebase 9.23.0.
- SheetJS 0.18.5.
- html2pdf.js 0.10.1.
- Apache ECharts 5.4.3.
- JSZip 3.10.1.
- Tabler Icons 2.47.0.

## 9. Mantenimiento y desarrollo

El desarrollo debe conservar la compatibilidad con los datos existentes y mantener la integridad de los registros.

Se recomienda:
- Mantener respaldos antes de realizar modificaciones.
- Evitar cambios innecesarios en la estructura de los archivos JSON.
- Validar la sincronización con GitHub después de cada actualización.
- Comprobar la compatibilidad en escritorio y dispositivos móviles.
- Optimizar las imágenes sin comprometer su legibilidad.
- Mantener la compatibilidad con las versiones anteriores de los datos.

## 10. Objetivo del proyecto

Desarrollar una herramienta centralizada para documentar y controlar los cambios de ingeniería y producción, mejorar la trazabilidad de las incidencias y facilitar el acceso a la información técnica desde diferentes dispositivos.

---

**Proyecto:** REPORTE-PRODUCTIVO  
**Repositorio:** https://github.com/javiera-sys/REPORTE-PRODUCTIVO  
**Desarrollo:** javiera-sys  
**Tecnologías principales:** HTML5, CSS3 y JavaScript.
