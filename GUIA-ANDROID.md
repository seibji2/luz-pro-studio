# 📱 Luz Pro Studio - Guía de Instalación en Android

Tu editor fotográfico profesional está listo. Aquí tienes las opciones para usarlo en Android:

---

## ✅ Opción 1: Progressive Web App (PWA) - RECOMENDADO

La forma más rápida de tener tu app en Android:

### Paso 1: Sube a hosting (ejemplo con Netlify)
1. Ve a [netlify.com](https://netlify.com) (gratis)
2. Arrastra todos los archivos al área de drop:
   - `luz-pro-studio.html`
   - `manifest.json`
3. ¡Listo! Obtendrás una URL pública

### Paso 2: Instala en Android
1. Abre la URL en **Chrome** de tu Android
2. Toca el menú (⋮ tres puntos) → **"Agregar a pantalla de inicio"**
3. ¡Listo! Aparecerá como app nativa con icono

---

## 🔧 Opción 2: Capacitor (APK Nativo)

Para crear un APK real que subas a Play Store:

### 1. Preparar proyecto
```bash
# Crear carpeta
mkdir luz-pro-studio
cd luz-pro-studio

# Inicializar npm
npm init -y

# Crear archivo base (copia el contenido de luz-pro-studio.html)
# en src/index.html
```

### 2. Instalar Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Luz Pro Studio" "com.luz.prostudio" --web-dir=src
```

### 3. Agregar plataforma Android
```bash
npx cap add android
npx cap copy android
npx cap open android
```

### 4. Construir APK en Android Studio
1. **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. APK estará en: `android/app/build/outputs/apk/debug/app-debug.apk`

### 5. Actualizar cambios
```bash
# Después de modificar código:
npm run build
npx cap copy android
npx cap sync android
```

---

## 📲 Opción 3: APK Instantáneo (Prueba rápida)

Si solo quieres probar en tu dispositivo:

1. Sube los archivos a cualquier hosting
2. Abre la URL en Chrome de Android
3. Usa **"Agregar a pantalla de inicio"**

---

## 🎨 Características Incluidas

### ✨ 22 Filtros Profesionales
- Original, Dorado, Frío, Noir, Vívido
- Desvanecido, Matte, Cine, Retrato, Atardecer
- Vintage, Polaroid, Kodachrome, Fuji
- Vista, Cross Process, Infrarrojo, Aqua
- Ocaso, Bosque, Otoño, Mood

### 🎚️ Ajustes Avanzados
- Exposición
- Brillo
- Contraste
- Saturación
- Temperatura
- Tinte
- Intensidad del filtro

### 🤖 IA Mágica
- Analiza tu foto automáticamente
- Sugiere el filtro perfecto
- Modo IA que aplica la sugerencia con 1 clic

### 📸 Modo Profesional
- Estilos de cámaras: Canon, Nikon, Sony, Fuji, Leica
- Películas clásicas: Portra, Velvia, Ektar, Tri-X
- Efectos: Viñeta, Brillo, Grano, Desenfoque, HDR

### 📱 Compartir
- Instagram
- Twitter/X
- WhatsApp
- TikTok
- Descargar en PNG

---

## 🌐 Hosteo Gratuito Recomendado

| Servicio | URL | Notas |
|----------|-----|-------|
| Netlify | netlify.com | Arrastra y suelta |
| Vercel | vercel.com | Muy rápido |
| GitHub Pages | pages.github.com | Requiere repo git |
| Cloudflare Pages | pages.cloudflare.com | CDN global |

---

## ❓ FAQ

**¿Necesito programar para crear el APK?**
No si usas PWA. Para APK nativo necesitas seguir los pasos de Capacitor.

**¿Puedo publicarlo en Play Store?**
¡Sí! Con Capacitor puedes firmar y subir a Play Store.

**¿Funciona offline?**
Sí, con PWA puedes usarlo sin internet una vez cargado.

**¿Puedo personalizarlo?**
Sí, puedes cambiar colores, filtros, nombre, etc.

---

¡Tu estudio fotográfico profesional está listo! 🚀
