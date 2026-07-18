# GraveSynth

Un sintetizador modular experimental que corre en el navegador. La física bidimensional — gravedad, colisiones, rebotes — es la partitura. Tú eres el arquitecto.

Dibuja líneas, coloca portales emisores y deja que las leyes de la física compongan por ti.

---

## Demo

[gravesynth en GitHub Pages](https://vlasvlasvlas.github.io/gravesynth/)

---

## Instalación

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en el navegador. El audio se activa con el primer click en el canvas (requisito del navegador).

```bash
npm run build    # build para producción
npm run preview  # preview del build
```

---

## Cómo funciona

### Las herramientas

| Icono | Herramienta | Atajo | Qué hace |
|-------|-------------|-------|----------|
| Cursor | Seleccionar | `S` | Selecciona y arrastra portales/aspiradoras |
| Cuadrado + punto | Portal | `P` | Emisor sonoro — escupe pelotas que caen con gravedad |
| Línea sólida | Línea Plena | `L` | Superficie continua — cada impacto dispara una nota |
| Línea dash | Línea Punteada | `D` | Superficie con gaps — genera ritmos mecánicos naturales |
| Línea móvil | Plataforma Móvil | `L` | Superficie corta que viaja de un extremo al otro del riel |
| Círculos | Aspiradora | `V` | Agujero negro — absorbe pelotas para limpiar el caos |
| Borrador | Borrador | `E` | Elimina cualquier objeto del canvas |

### El ciclo físico-musical

1. Un **Portal** emite pelotas a un ritmo configurable (RPM).
2. Las pelotas caen bajo gravedad (Matter.js) y rebotan en las **líneas** que dibujaste.
3. Cada colisión dispara una nota en Tone.js: la velocidad del impacto mapea al volumen, el ángulo al paneo estéreo.
4. Las notas pertenecen a la **escala** y **tono raíz** configurados en el portal (mayor, menor, pentatónica, dórica).
5. El modo **Arpegio ↑/↓** sube o baja por la escala con cada pelota emitida. **Random** elige dentro de la escala al azar.
6. Las **Aspiradoras** atraen pelotas dentro de su radio y las eliminan con fade out para liberar memoria y controlar la densidad sonora.

### Configuración de un Portal

Coloca un portal (`P`), luego haz click sobre él con la herramienta de selección (`S`) para abrir el panel lateral:

| Parámetro | Descripción |
|-----------|-------------|
| Volumen | dB de ese canal de audio (−40 a 0 dB) |
| Nota Raíz | Tónica de la escala (C, C#, D...) |
| Escala | Major, Minor, Pentatonic, Dorian |
| Modo | Random / Arpegio ↑ / Arpegio ↓ |
| RPM | Pelotas por minuto emitidas |
| Tamaño | Radio de las pelotas (afecta masa física) |
| Preset | Selecciona un parche de síntesis predefinido |
| YAML | Editor directo del parche (ver sección abajo) |

### Configuración Global

Haz click en el ícono ⚙️ sin ningún objeto seleccionado:

- **Tempo (BPM):** sincroniza la emisión de todos los portales al Transport de Tone.js
- **Volumen Master:** controla `Tone.Destination.volume` (−40 a 0 dB)

---

## Crear nuevos sonidos con YAML

Cada portal tiene un editor YAML integrado que instancia sintetizadores de Tone.js en tiempo real. Puedes editar el parche directamente sin recargar la página.

### Estructura básica

```yaml
type: "MonoSynth"
oscillator:
  type: "sawtooth"   # sine | square | triangle | sawtooth | pulse | pwm
envelope:
  attack: 0.01
  decay: 0.1
  sustain: 0.5
  release: 1.0
```

El campo `type` determina el motor de síntesis. El resto son sus opciones nativas de Tone.js.

---

### Tipos de sintetizador disponibles

#### `MonoSynth` — Substractivo clásico

Ideal para bajos, leads y cuerdas. Tiene oscilador + filtro + envolventes independientes para tono y filtro.

```yaml
type: "MonoSynth"
oscillator:
  type: "sawtooth"
envelope:
  attack: 0.01
  decay: 0.2
  sustain: 0.6
  release: 1.5
filter:
  type: "lowpass"    # lowpass | highpass | bandpass | notch
  Q: 3               # resonancia del filtro
  rolloff: -24       # -12 | -24 | -48 dB/oct
filterEnvelope:
  attack: 0.02
  decay: 0.4
  sustain: 0.3
  release: 2.0
  baseFrequency: 200  # frecuencia base del filtro en Hz
  octaves: 4          # cuántos octavos sube el filtro al tocar
```

#### `FMSynth` — Síntesis FM

Carrier modulado por un operador. Produce timbres metálicos, campanas, percusión sintética y texturas eléctricas.

```yaml
type: "FMSynth"
harmonicity: 3         # relación de frecuencia entre carrier y modulador
modulationIndex: 10    # profundidad de modulación (más alto = más ruidoso/metálico)
oscillator:
  type: "sine"
modulation:
  type: "square"
envelope:
  attack: 0.01
  decay: 0.5
  sustain: 0.2
  release: 2.0
modulationEnvelope:
  attack: 0.5
  decay: 0.1
  sustain: 0.2
  release: 0.5
```

> **Regla de oro FM:** `harmonicity` bajo (0.5, 1, 2) = armónico. `harmonicity` irracional (2.1, 3.7) = inarmónico, percusivo. `modulationIndex` alto = distorsión y ruido.

#### `AMSynth` — Síntesis AM (modulación de amplitud)

El modulador controla el volumen del carrier. Genera pads etéreos, texturas trémolo y sonidos que pulsan.

```yaml
type: "AMSynth"
harmonicity: 0.5       # frecuencia relativa del modulador de amplitud
oscillator:
  type: "triangle"
modulation:
  type: "sine"
envelope:
  attack: 0.5
  decay: 1.0
  sustain: 0.8
  release: 4.0
modulationEnvelope:
  attack: 0.5
  decay: 0.1
  sustain: 1.0
  release: 0.5
```

---

### Presets incluidos

| Preset | Tipo | Carácter |
|--------|------|----------|
| **Acid House 303** | MonoSynth | Saw con filtro lowpass muy resonante, decay corto y portamento para líneas líquidas |
| **Detroit Techno Bass** | MonoSynth | Pulso analógico seco, repetitivo, con filtro rápido y bajo presente |
| **Electro 808 Funk** | FMSynth | Ataque inmediato, cuadrada/FM y cola corta para frases sintéticas tipo electro |
| **Dub Techno Stab** | MonoSynth | Ataque blando, filtro oscuro y release largo; funciona muy bien con líneas con reverb/eco |
| **Ambient Tape Loops** | AMSynth | Attack largo y sustain alto para capas lentas, drones y portales de baja RPM |
| **Berlin School Pulse** | MonoSynth | Pulso secuenciado, saw brillante y release medio para arpegios hipnóticos |
| **Robot Pop Minimal** | MonoSynth | Cuadrada limpia, frase corta y mecánica, buena para patrones repetitivos |
| **FM Glass Bell** | FMSynth | Campana digital con ataque suavizado y cola usable |
| **Deep Organ Drift** | AMSynth | Entrada lenta/intermedia, cuerpo estable y cola larga para colchones armónicos |
| **French House Pluck** | MonoSynth | Pluck filtrado, rápido y resonante sin atarlo a un artista específico |

Los presets priorizan rasgos de producción de estilos influyentes de la electrónica: 303 acid con filtro resonante, techno de Detroit con bajo mecánico, electro con timbre cuadrado/FM, dub techno con stabs filtrados y ambientes de tape-loop con ataques lentos.

---

### Recetas de síntesis

**Pad ambiental lento**
```yaml
type: "MonoSynth"
oscillator:
  type: "triangle"
envelope:
  attack: 2.0
  decay: 1.0
  sustain: 0.9
  release: 5.0
filter:
  type: "lowpass"
  Q: 1
filterEnvelope:
  attack: 3.0
  decay: 2.0
  sustain: 0.7
  release: 5.0
  baseFrequency: 100
  octaves: 2
```

**Campana metálica FM**
```yaml
type: "FMSynth"
harmonicity: 7
modulationIndex: 25
oscillator:
  type: "sine"
modulation:
  type: "sine"
envelope:
  attack: 0.001
  decay: 2.0
  sustain: 0
  release: 0.5
modulationEnvelope:
  attack: 0.001
  decay: 1.5
  sustain: 0
  release: 0.5
```

**Bajo pulsante AM**
```yaml
type: "AMSynth"
harmonicity: 2
oscillator:
  type: "square"
modulation:
  type: "sine"
envelope:
  attack: 0.01
  decay: 0.3
  sustain: 0.5
  release: 1.0
modulationEnvelope:
  attack: 0.01
  decay: 0.5
  sustain: 0.3
  release: 0.5
```

**Pluck digital punchy**
```yaml
type: "MonoSynth"
oscillator:
  type: "pulse"
  width: 0.3
envelope:
  attack: 0.001
  decay: 0.08
  sustain: 0
  release: 0.2
filter:
  type: "highpass"
  Q: 2
filterEnvelope:
  attack: 0.001
  decay: 0.05
  sustain: 0
  release: 0.1
  baseFrequency: 800
  octaves: -2
```

---

### Parámetros de síntesis — referencia rápida

| Parámetro | Rango típico | Efecto |
|-----------|-------------|--------|
| `attack` | 0.001 – 5.0 s | Tiempo en llegar al pico de volumen |
| `decay` | 0.01 – 5.0 s | Tiempo en bajar desde el pico al sustain |
| `sustain` | 0.0 – 1.0 | Nivel de volumen mientras la nota está sostenida |
| `release` | 0.01 – 10.0 s | Tiempo en apagar después de soltar la nota |
| `baseFrequency` | 20 – 20000 Hz | Frecuencia inicial del filtro |
| `octaves` | -4 – 8 | Cuánto sube/baja el filtro durante el attack |
| `Q` | 0.1 – 50 | Resonancia del filtro (pico en la frecuencia de corte) |
| `harmonicity` | 0.1 – 20 | Ratio entre portadora y modulador (FM/AM) |
| `modulationIndex` | 0 – 100 | Profundidad de modulación FM (más = más ruidoso) |

---

### Tips de diseño sonoro

- **Escala + arquitectura = melodía:** La misma escala en portales diferentes con líneas en distintas alturas genera contrapuntos naturales por la física.
- **Velocidad de impacto:** colisiones fuertes (líneas horizontales) disparan notas fuertes; impactos tangenciales (líneas en ángulo) producen notas suaves.
- **RPM bajo + release largo** = pad generativo. **RPM alto + decay corto** = secuencia rítmica.
- **Línea punteada + FM con modulationIndex alto** = percusión industrial rítmica sin necesidad de configurar tempo.
- **Dos portales en la misma escala, arpegio ↑ y ↓** = contrapunto automático.
- **Aspiradora con radio grande y fuerza baja** = limpieza gradual; con radio pequeño y fuerza alta = puerta rítmica.

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Build | [Vite](https://vitejs.dev/) |
| Física | [Matter.js 0.20](https://brm.io/matter-js/) |
| Audio | [Tone.js 15](https://tonejs.github.io/) |
| Visual | [p5.js 2](https://p5js.org/) (instance mode) |
| Síntesis YAML | [js-yaml 5](https://github.com/nodeca/js-yaml) |
| Deploy | GitHub Pages |

---

## Arquitectura del código

```
src/
├── main.js      — punto de entrada, orquesta todos los módulos
├── state.js     — estado global compartido (portales, líneas, vacuums)
├── physics.js   — Matter.js engine, spawn de pelotas, eventos de colisión
├── audio.js     — Tone.js, síntesis YAML, cadena de efectos master
├── visual.js    — p5.js, render a 60fps, input del usuario
└── ui.js        — sidebar, presets YAML, formularios de configuración
```

El loop de física corre **dentro** del loop de render de p5 (no en un `requestAnimationFrame` separado) para evitar tearing visual por posiciones desfasadas.

La cadena de audio master es: `PolySynth → Channel (vol + pan) → FeedbackDelay → Reverb → Destination`.

---

## Licencia

MIT
