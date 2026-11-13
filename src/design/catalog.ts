export type TldrawColor =
  | 'black'
  | 'grey'
  | 'light-violet'
  | 'violet'
  | 'blue'
  | 'light-blue'
  | 'yellow'
  | 'orange'
  | 'green'
  | 'light-green'
  | 'light-red'
  | 'red'
  | 'white'

export type TldrawFill = 'none' | 'semi' | 'solid' | 'pattern'
export type TldrawDash = 'draw' | 'solid' | 'dashed' | 'dotted'
export type TldrawSize = 's' | 'm' | 'l' | 'xl'
export type TldrawFont = 'draw' | 'sans' | 'serif' | 'mono'
export type TldrawGeo =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'trapezoid'
  | 'rhombus'
  | 'hexagon'
  | 'cloud'
  | 'star'
  | 'oval'
  | 'x-box'
  | 'check-box'
  | 'heart'

export type CommandIntentId =
  | 'create_shape'
  | 'create_note'
  | 'create_text'
  | 'connect_shapes'
  | 'generate_layout'
  | 'apply_theme'
  | 'style_target'
  | 'move_target'
  | 'resize_target'
  | 'delete_target'
  | 'duplicate_target'
  | 'rename_target'
  | 'group_frame'
  | 'align_shapes'
  | 'distribute_shapes'
  | 'highlight_target'
  | 'swap_positions'
  | 'camera_control'
  | 'vision_harmonize'
  | 'undo_redo'
  | 'clear_canvas'

export interface CommandIntentSpec {
  id: CommandIntentId
  title: string
  description: string
  exemplars: string[]
}

export interface DesignThemeSpec {
  id: string
  name: string
  title: string
  description: string
  isDark: boolean
  canvasBg: string
  accentHex: string
  primaryColor: TldrawColor
  secondaryColor: TldrawColor
  accentColor: TldrawColor
  mutedColor: TldrawColor
  fill: TldrawFill
  dash: TldrawDash
  font: TldrawFont
  size: TldrawSize
}

export interface ShapeArchetypeSpec {
  id: string
  title: string
  description: string
  kind: 'geo' | 'note' | 'text' | 'frame'
  geo?: TldrawGeo
  defaultColor: TldrawColor
  defaultFill: TldrawFill
  width: number
  height: number
}

export interface LayoutNodeBlueprint {
  key: string
  label: string
  archetype: string
  dx: number
  dy: number
  w?: number
  h?: number
  colorRole?: 'primary' | 'secondary' | 'accent' | 'muted'
}

export interface LayoutEdgeBlueprint {
  from: string
  to: string
  label?: string
  bend?: number
}

export interface LayoutTemplateSpec {
  id: string
  name: string
  title: string
  description: string
  frameLabel?: string
  nodes: LayoutNodeBlueprint[]
  edges: LayoutEdgeBlueprint[]
}

export const COMMAND_INTENTS: CommandIntentSpec[] = [
  {
    id: 'create_shape',
    title: 'Create Shape or Component Node',
    description:
      'Draw or add a single geometric shape, box, rectangle, circle, diamond, cloud, database, service node, card, star, hexagon, checkbox, or component onto the canvas.',
    exemplars: [
      'draw a blue rectangle called API Gateway',
      'add a cloud shape for AWS storage',
      'create a database node in the center',
      'put a decision diamond labeled Auth Check',
      'add a red warning triangle',
      'draw a circle called User Session',
      'drop a box for the payment service',
    ],
  },
  {
    id: 'create_note',
    title: 'Create Sticky Note or Memo',
    description:
      'Add a sticky note, post-it, yellow memo card, reminder note, or thought bubble with text onto the canvas.',
    exemplars: [
      'add a sticky note saying review security audit',
      'create a note that says ship beta on Friday',
      'put a yellow post-it note for edge cases',
      'write a sticky note about latency targets',
    ],
  },
  {
    id: 'create_text',
    title: 'Write Text Heading or Label',
    description:
      'Write a standalone title, heading, banner text, caption, or label directly on the canvas without a box border.',
    exemplars: [
      'write a title saying Voice Architecture v2',
      'add heading text Q4 Product Roadmap',
      'put a big label called Core Platform',
      'type text saying Zero UI Canvas',
    ],
  },
  {
    id: 'connect_shapes',
    title: 'Connect Two Shapes with Bound Arrow',
    description:
      'Draw a bound arrow, line, link, dependency flow, or connection from one shape or node on the canvas to another shape.',
    exemplars: [
      'connect the login box to the user store',
      'draw an arrow from API Gateway to Auth Service',
      'link the frontend to the backend database',
      'point the decision diamond to the error handler',
      'connect client to server',
    ],
  },
  {
    id: 'generate_layout',
    title: 'Generate Multi-Shape Diagram or Layout Template',
    description:
      'Build a complete diagram layout, system architecture pipeline, flowchart, mind map, Kanban board, 2x2 matrix, timeline roadmap, RAG vector pipeline, event mesh, C4 context diagram, or user journey funnel.',
    exemplars: [
      'generate a system architecture diagram',
      'create a decision flowchart for user onboarding',
      'draw a mind map around AI Voice Canvas',
      'build a kanban board with backlog in progress and done',
      'make a two by two priority matrix',
      'lay out a product roadmap timeline',
      'generate a rag vector pipeline diagram',
      'create an event driven pub sub mesh',
      'draw a c4 system context diagram',
      'build a user journey funnel',
    ],
  },
  {
    id: 'apply_theme',
    title: 'Apply Visual Design Theme or Aesthetic Vibe',
    description:
      'Switch the overall visual design system, aesthetic vibe, color palette, typography, dark blueprint style, cyberpunk neon, warm editorial, nordic minimal, bauhaus, tokyo midnight, solarized, or sketchy look across the canvas.',
    exemplars: [
      'make the design look like a technical dark blueprint',
      'switch to cyberpunk neon aesthetic',
      'apply a warm editorial paper style',
      'use a hand drawn playful sketchbook vibe',
      'give it a clean nordic minimal design',
      'change the theme to botanical forest',
      'use high contrast executive styling',
      'switch to bauhaus primary geometric style',
      'apply tokyo midnight violet theme',
      'use solarized lab aesthetic',
    ],
  },
  {
    id: 'style_target',
    title: 'Restyle or Recolor Existing Shape',
    description:
      'Change the color, fill pattern, border dash style, or font of an existing shape or all shapes on the canvas.',
    exemplars: [
      'make the database node green',
      'color the API gateway violet',
      'change the warning box to solid red',
      'make the login card dashed',
      'turn all shapes light blue',
    ],
  },
  {
    id: 'move_target',
    title: 'Move or Reposition Shape',
    description:
      'Move, nudge, shift, or place a specific shape left, right, up, down, to the center, or relative to another shape.',
    exemplars: [
      'move the database node to the right',
      'shift the login box up',
      'put the cache service below the API gateway',
      'move the sticky note to the left',
      'place the gateway above the core engine',
    ],
  },
  {
    id: 'resize_target',
    title: 'Resize or Scale Shape',
    description:
      'Make a shape larger, smaller, wider, taller, huge, or compact on the canvas.',
    exemplars: [
      'make the architecture box bigger',
      'scale up the central node',
      'make the sticky note smaller',
      'widen the gateway rectangle',
    ],
  },
  {
    id: 'delete_target',
    title: 'Delete or Remove Shape',
    description:
      'Delete, remove, erase, or drop a specific shape, note, or node from the canvas.',
    exemplars: [
      'delete the warning box',
      'remove the old sticky note',
      'erase the cache node',
      'get rid of the temp rectangle',
    ],
  },
  {
    id: 'duplicate_target',
    title: 'Duplicate or Clone Shape',
    description:
      'Duplicate, clone, copy, or make another instance of an existing shape or node on the canvas.',
    exemplars: [
      'duplicate the API gateway',
      'clone the database node',
      'make a copy of the sticky note',
      'duplicate the central hexagon',
    ],
  },
  {
    id: 'rename_target',
    title: 'Rename or Update Text of Shape',
    description:
      'Rename, relabel, or change the text inside an existing shape, note, or heading.',
    exemplars: [
      'rename the database node to Postgres Replica',
      'relabel the gateway to Edge Proxy',
      'change the sticky note text to Ship Ready',
    ],
  },
  {
    id: 'group_frame',
    title: 'Wrap or Enclose Shapes in a Frame',
    description:
      'Create a visual container frame around all shapes or specific nodes to group them into a named subsystem or cluster.',
    exemplars: [
      'frame all shapes as Core Platform',
      'wrap these nodes in a frame called Backend Cluster',
      'enclose everything in a container frame named Voice Pipeline',
    ],
  },
  {
    id: 'align_shapes',
    title: 'Align or Organize Canvas Shapes',
    description:
      'Neatly align, arrange, tidy up, or organize shapes into a clean horizontal row, vertical column, or balanced grid.',
    exemplars: [
      'align all shapes horizontally in a row',
      'stack the nodes vertically in a column',
      'organize everything into a clean grid',
      'tidy up the layout',
    ],
  },
  {
    id: 'distribute_shapes',
    title: 'Distribute Shapes Evenly or in a Circle',
    description:
      'Space out shapes evenly, spread them apart, or arrange them in a radial circle or ring layout.',
    exemplars: [
      'arrange all shapes in a circle',
      'distribute the nodes evenly',
      'space everything out more',
      'put the shapes in a radial ring',
    ],
  },
  {
    id: 'highlight_target',
    title: 'Focus or Spotlight Specific Shape',
    description:
      'Zoom the camera onto a specific shape, spotlight it, or focus the view on a particular node.',
    exemplars: [
      'focus on the database node',
      'zoom to the API gateway',
      'spotlight the EmbeddingGemma hexagon',
      'find the sticky note',
    ],
  },
  {
    id: 'swap_positions',
    title: 'Swap Positions of Two Shapes',
    description:
      'Swap, exchange, or trade the canvas coordinates of two shapes or nodes.',
    exemplars: [
      'swap the Earlybird node and the Zero-UI Canvas',
      'switch the positions of the gateway and the database',
      'exchange the login box with the user store',
    ],
  },
  {
    id: 'camera_control',
    title: 'Zoom or Pan Canvas Camera',
    description:
      'Zoom in, zoom out, fit all shapes into the viewport, or pan the camera view left, right, up, or down.',
    exemplars: [
      'zoom out to see everything',
      'zoom in closer',
      'fit all shapes on screen',
      'pan the camera left',
    ],
  },
  {
    id: 'vision_harmonize',
    title: 'Harmonize Visual Design with Multimodal Vision',
    description:
      'Inspect the visual snapshot of the canvas with EmbeddingGemma 2 vision-text embeddings and automatically harmonize colors, contrast, and layout balance.',
    exemplars: [
      'harmonize the visual design of the canvas',
      'critique and balance the visual style',
      'auto align the aesthetic with vision',
      'polish the visual design',
    ],
  },
  {
    id: 'undo_redo',
    title: 'Undo or Redo Action',
    description: 'Undo the previous canvas command, step backward, or redo the undone change.',
    exemplars: ['undo that', 'go back one step', 'redo that change', 'undo last action'],
  },
  {
    id: 'clear_canvas',
    title: 'Clear Entire Canvas',
    description: 'Clear, wipe, reset, or delete everything on the entire canvas to start fresh.',
    exemplars: ['clear the canvas', 'wipe everything clean', 'delete all shapes', 'start over fresh'],
  },
]

export const DESIGN_THEMES: DesignThemeSpec[] = [
  {
    id: 'blueprint-dark',
    name: 'Technical Blueprint',
    title: 'Technical Blueprint Dark',
    description:
      'Deep architectural navy blueprint aesthetic with glowing cyan and cobalt precision schematics, monospace engineering typography, and semi-translucent fills.',
    isDark: true,
    canvasBg: '#08101d',
    accentHex: '#38bdf8',
    primaryColor: 'light-blue',
    secondaryColor: 'blue',
    accentColor: 'light-violet',
    mutedColor: 'grey',
    fill: 'semi',
    dash: 'solid',
    font: 'mono',
    size: 'm',
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    title: 'Cyberpunk Neon Synth',
    description:
      'High-voltage futuristic cyberpunk dark mode with electric violet, hot red-magenta, neon yellow, and cyan nodes on an obsidian nocturnal grid.',
    isDark: true,
    canvasBg: '#090614',
    accentHex: '#c084fc',
    primaryColor: 'violet',
    secondaryColor: 'light-red',
    accentColor: 'yellow',
    mutedColor: 'light-blue',
    fill: 'solid',
    dash: 'solid',
    font: 'mono',
    size: 'm',
  },
  {
    id: 'warm-editorial',
    name: 'Warm Editorial',
    title: 'Warm Editorial Studio',
    description:
      'Refined architectural print magazine aesthetic with warm cream paper background, terracotta red, burnt orange, sage green, and serif book typography.',
    isDark: false,
    canvasBg: '#f8f4ec',
    accentHex: '#ea580c',
    primaryColor: 'orange',
    secondaryColor: 'red',
    accentColor: 'green',
    mutedColor: 'black',
    fill: 'semi',
    dash: 'solid',
    font: 'serif',
    size: 'm',
  },
  {
    id: 'playful-sketch',
    name: 'Playful Sketchbook',
    title: 'Hand-Drawn Whiteboard Sketch',
    description:
      'Expressive hand-drawn whiteboard marker sketch style with organic wobbly strokes, hatched pattern fills, sunny yellow, mint green, and playful lettering.',
    isDark: false,
    canvasBg: '#fcfbf7',
    accentHex: '#f59e0b',
    primaryColor: 'yellow',
    secondaryColor: 'light-green',
    accentColor: 'light-red',
    mutedColor: 'violet',
    fill: 'pattern',
    dash: 'draw',
    font: 'draw',
    size: 'm',
  },
  {
    id: 'nordic-minimal',
    name: 'Nordic Minimal',
    title: 'Nordic Minimalist Swiss Grid',
    description:
      'Ultra-clean Scandinavian and Swiss modernist minimal design with cool alabaster surface, charcoal lines, muted cobalt accents, and geometric sans-serif clarity.',
    isDark: false,
    canvasBg: '#f1f5f9',
    accentHex: '#2563eb',
    primaryColor: 'black',
    secondaryColor: 'blue',
    accentColor: 'light-blue',
    mutedColor: 'grey',
    fill: 'none',
    dash: 'solid',
    font: 'sans',
    size: 'm',
  },
  {
    id: 'forest-organic',
    name: 'Botanical Forest',
    title: 'Botanical Forest Canopy',
    description:
      'Calm organic dark moss and pine studio aesthetic with emerald green, warm amber, soft sage, and grounded natural balance.',
    isDark: true,
    canvasBg: '#0b1912',
    accentHex: '#34d399',
    primaryColor: 'light-green',
    secondaryColor: 'green',
    accentColor: 'yellow',
    mutedColor: 'orange',
    fill: 'semi',
    dash: 'solid',
    font: 'serif',
    size: 'm',
  },
  {
    id: 'executive-contrast',
    name: 'Executive Contrast',
    title: 'High-Contrast Executive Deck',
    description:
      'Sharp boardroom presentation aesthetic on deep carbon slate with bold white, cobalt blue, emerald status, and crisp sans-serif hierarchy.',
    isDark: true,
    canvasBg: '#0b0c10',
    accentHex: '#60a5fa',
    primaryColor: 'blue',
    secondaryColor: 'light-green',
    accentColor: 'orange',
    mutedColor: 'grey',
    fill: 'solid',
    dash: 'solid',
    font: 'sans',
    size: 'l',
  },
  {
    id: 'bauhaus-geometric',
    name: 'Bauhaus Primary',
    title: 'Bauhaus Modernist Geometry',
    description:
      'Iconic Weimar Bauhaus poster aesthetic on warm museum cardstock with primary red, cobalt blue, ochre yellow, and heavy black structural lines.',
    isDark: false,
    canvasBg: '#f4efe6',
    accentHex: '#dc2626',
    primaryColor: 'red',
    secondaryColor: 'blue',
    accentColor: 'yellow',
    mutedColor: 'black',
    fill: 'solid',
    dash: 'solid',
    font: 'sans',
    size: 'm',
  },
  {
    id: 'tokyo-midnight',
    name: 'Tokyo Midnight',
    title: 'Tokyo Midnight Indigo & Coral',
    description:
      'Atmospheric nocturnal Tokyo design system with deep indigo background, soft lavender violet, coral rose, and crisp cyan data lines.',
    isDark: true,
    canvasBg: '#070814',
    accentHex: '#f472b6',
    primaryColor: 'light-violet',
    secondaryColor: 'light-blue',
    accentColor: 'light-red',
    mutedColor: 'violet',
    fill: 'semi',
    dash: 'solid',
    font: 'sans',
    size: 'm',
  },
  {
    id: 'solarized-lab',
    name: 'Solarized Lab',
    title: 'Solarized Dark Research Terminal',
    description:
      'Precision scientific instrument aesthetic inspired by Ethan Schoonover Solarized Dark with deep teal-slate background, cyan, amber yellow, and green.',
    isDark: true,
    canvasBg: '#00212b',
    accentHex: '#2aa198',
    primaryColor: 'light-blue',
    secondaryColor: 'yellow',
    accentColor: 'light-green',
    mutedColor: 'orange',
    fill: 'semi',
    dash: 'dashed',
    font: 'mono',
    size: 'm',
  },
]

export const SHAPE_ARCHETYPES: ShapeArchetypeSpec[] = [
  {
    id: 'service-box',
    title: 'Service Box / Component Card',
    description: 'Standard rectangular module, microservice, backend server, API card, box, or container block.',
    kind: 'geo',
    geo: 'rectangle',
    defaultColor: 'light-blue',
    defaultFill: 'semi',
    width: 220,
    height: 110,
  },
  {
    id: 'database-node',
    title: 'Database / Storage Cylinder',
    description: 'Database, SQL store, Postgres, Redis cache, vector index, data warehouse, or persistent storage.',
    kind: 'geo',
    geo: 'oval',
    defaultColor: 'green',
    defaultFill: 'semi',
    width: 205,
    height: 115,
  },
  {
    id: 'cloud-node',
    title: 'Cloud / External Network',
    description: 'Cloud infrastructure, internet, AWS, GCP, external third-party API, CDN, or serverless cluster.',
    kind: 'geo',
    geo: 'cloud',
    defaultColor: 'light-violet',
    defaultFill: 'semi',
    width: 235,
    height: 130,
  },
  {
    id: 'decision-diamond',
    title: 'Decision / Router / Gate Diamond',
    description: 'Conditional branch, if/else check, authentication gate, load balancer, router, or decision diamond.',
    kind: 'geo',
    geo: 'diamond',
    defaultColor: 'orange',
    defaultFill: 'semi',
    width: 195,
    height: 145,
  },
  {
    id: 'actor-circle',
    title: 'User / Actor / Endpoint Circle',
    description: 'User, client, browser, person, mobile app, start/end terminal, or circular state node.',
    kind: 'geo',
    geo: 'ellipse',
    defaultColor: 'yellow',
    defaultFill: 'semi',
    width: 165,
    height: 165,
  },
  {
    id: 'engine-hexagon',
    title: 'AI Model / Processor Hexagon',
    description: 'AI model, neural network, Earlybird STT, EmbeddingGemma engine, worker processor, or compute kernel.',
    kind: 'geo',
    geo: 'hexagon',
    defaultColor: 'violet',
    defaultFill: 'solid',
    width: 220,
    height: 125,
  },
  {
    id: 'alert-triangle',
    title: 'Warning / Alert / Risk Triangle',
    description: 'Warning, error alert, bottleneck, security risk, incident, or caution marker.',
    kind: 'geo',
    geo: 'triangle',
    defaultColor: 'red',
    defaultFill: 'semi',
    width: 185,
    height: 150,
  },
  {
    id: 'milestone-star',
    title: 'Milestone / Goal Star',
    description: 'Launch milestone, north star goal, key highlight, badge, or hero achievement.',
    kind: 'geo',
    geo: 'star',
    defaultColor: 'yellow',
    defaultFill: 'solid',
    width: 180,
    height: 180,
  },
  {
    id: 'pipeline-trapezoid',
    title: 'Queue / Funnel / Stream Stage',
    description: 'Message queue, Kafka stream, ingestion funnel, audio buffer, or transformation stage.',
    kind: 'geo',
    geo: 'trapezoid',
    defaultColor: 'blue',
    defaultFill: 'semi',
    width: 220,
    height: 110,
  },
  {
    id: 'transform-rhombus',
    title: 'Data Transform / Adapter Parallelogram',
    description: 'ETL transform, parser, serializer, embedding projection, or adapter stage.',
    kind: 'geo',
    geo: 'rhombus',
    defaultColor: 'light-blue',
    defaultFill: 'semi',
    width: 215,
    height: 110,
  },
  {
    id: 'check-item',
    title: 'Verified / Approved Check Box',
    description: 'Completed task, verified check, passing test, or approved gate.',
    kind: 'geo',
    geo: 'check-box',
    defaultColor: 'light-green',
    defaultFill: 'semi',
    width: 190,
    height: 105,
  },
  {
    id: 'favorite-heart',
    title: 'Delight / Core Value Heart',
    description: 'User delight, favorite metric, brand love, or customer loyalty node.',
    kind: 'geo',
    geo: 'heart',
    defaultColor: 'light-red',
    defaultFill: 'solid',
    width: 170,
    height: 160,
  },
  {
    id: 'sticky-note',
    title: 'Sticky Note / Idea Memo',
    description: 'Sticky note, post-it, annotation, brainstorm idea, comment, or todo reminder.',
    kind: 'note',
    defaultColor: 'yellow',
    defaultFill: 'solid',
    width: 200,
    height: 200,
  },
]

export const LAYOUT_TEMPLATES: LayoutTemplateSpec[] = [
  {
    id: 'architecture-pipeline',
    name: 'System Architecture Pipeline',
    title: 'System Architecture & Microservices Pipeline',
    description:
      'End-to-end technical system architecture diagram with Client ingress, Gateway, AI/Core Engine, Cache, and Database tiers connected by data flow arrows.',
    frameLabel: 'System Architecture',
    nodes: [
      { key: 'client', label: 'Voice Client', archetype: 'actor-circle', dx: -440, dy: 0, colorRole: 'accent' },
      { key: 'gateway', label: 'Stream Gateway', archetype: 'pipeline-trapezoid', dx: -150, dy: 0, colorRole: 'primary' },
      { key: 'engine', label: 'Core Engine', archetype: 'engine-hexagon', dx: 155, dy: -110, colorRole: 'secondary' },
      { key: 'cache', label: 'Vector Index', archetype: 'service-box', dx: 155, dy: 110, colorRole: 'primary' },
      { key: 'db', label: 'Primary Store', archetype: 'database-node', dx: 450, dy: 0, colorRole: 'accent' },
    ],
    edges: [
      { from: 'client', to: 'gateway', label: 'PCM 16kHz' },
      { from: 'gateway', to: 'engine', label: '80ms frames' },
      { from: 'gateway', to: 'cache', label: 'query' },
      { from: 'engine', to: 'db', label: 'commit' },
      { from: 'cache', to: 'db', label: 'sync' },
    ],
  },
  {
    id: 'flowchart-decision',
    name: 'Decision Flowchart',
    title: 'Decision Flowchart & Branching Logic',
    description:
      'Structured algorithmic flowchart with a starting state, processing step, conditional decision diamond, and approved vs fallback outcome branches.',
    frameLabel: 'Decision Flow',
    nodes: [
      { key: 'start', label: 'Voice Input', archetype: 'actor-circle', dx: -400, dy: 0, colorRole: 'primary' },
      { key: 'parse', label: 'Embed Intent', archetype: 'service-box', dx: -130, dy: 0, colorRole: 'primary' },
      { key: 'check', label: 'Confidence > 85%?', archetype: 'decision-diamond', dx: 150, dy: 0, colorRole: 'accent' },
      { key: 'exec', label: 'Execute on Canvas', archetype: 'engine-hexagon', dx: 440, dy: -120, colorRole: 'secondary' },
      { key: 'ghost', label: 'Show Ghost Preview', archetype: 'sticky-note', dx: 440, dy: 125, colorRole: 'muted' },
    ],
    edges: [
      { from: 'start', to: 'parse' },
      { from: 'parse', to: 'check' },
      { from: 'check', to: 'exec', label: 'Yes' },
      { from: 'check', to: 'ghost', label: 'Speculative' },
    ],
  },
  {
    id: 'mindmap-radial',
    name: 'Radial Mind Map',
    title: 'Radial Concept Mind Map',
    description:
      'Central core thesis node surrounded by five radiating thematic branches for brainstorming, concept mapping, and topic exploration.',
    frameLabel: 'Concept Mind Map',
    nodes: [
      { key: 'center', label: 'Central Idea', archetype: 'engine-hexagon', dx: 0, dy: 0, w: 245, h: 135, colorRole: 'primary' },
      { key: 'n1', label: 'Voice UX', archetype: 'service-box', dx: -360, dy: -180, colorRole: 'secondary' },
      { key: 'n2', label: 'Visual Design', archetype: 'service-box', dx: 360, dy: -180, colorRole: 'accent' },
      { key: 'n3', label: 'Local Models', archetype: 'cloud-node', dx: -380, dy: 160, colorRole: 'secondary' },
      { key: 'n4', label: 'Zero Buttons', archetype: 'milestone-star', dx: 380, dy: 160, colorRole: 'accent' },
      { key: 'n5', label: 'Key Notes', archetype: 'sticky-note', dx: 0, dy: 265, colorRole: 'muted' },
    ],
    edges: [
      { from: 'center', to: 'n1', bend: 24 },
      { from: 'center', to: 'n2', bend: -24 },
      { from: 'center', to: 'n3', bend: -20 },
      { from: 'center', to: 'n4', bend: 20 },
      { from: 'center', to: 'n5' },
    ],
  },
  {
    id: 'kanban-board',
    name: 'Kanban Board',
    title: 'Kanban Workflow Columns (Backlog, In Progress, Shipped)',
    description:
      'Agile project board with three structured vertical columns for Backlog, Active Work, and Completed items with task cards underneath.',
    frameLabel: 'Kanban Workflow',
    nodes: [
      { key: 'col1', label: 'BACKLOG', archetype: 'service-box', dx: -330, dy: -165, w: 240, h: 80, colorRole: 'muted' },
      { key: 'c1a', label: 'Multi-modal Critique', archetype: 'sticky-note', dx: -330, dy: 35, colorRole: 'muted' },
      { key: 'col2', label: 'IN PROGRESS', archetype: 'service-box', dx: 0, dy: -165, w: 240, h: 80, colorRole: 'primary' },
      { key: 'c2a', label: 'Live Voice Canvas', archetype: 'sticky-note', dx: 0, dy: 35, colorRole: 'primary' },
      { key: 'col3', label: 'SHIPPED', archetype: 'check-item', dx: 330, dy: -165, w: 240, h: 80, colorRole: 'accent' },
      { key: 'c3a', label: 'Earlybird 80ms Stream', archetype: 'sticky-note', dx: 330, dy: 35, colorRole: 'accent' },
    ],
    edges: [
      { from: 'col1', to: 'col2', label: 'pull' },
      { from: 'col2', to: 'col3', label: 'ship' },
    ],
  },
  {
    id: 'matrix-2x2',
    name: '2x2 Strategy Matrix',
    title: '2x2 Impact vs Effort Quadrant Matrix',
    description:
      'Four-quadrant strategic comparison grid organizing initiatives into Quick Wins, Major Bets, Fill-Ins, and Hard Slogs.',
    frameLabel: '2x2 Strategy Matrix',
    nodes: [
      { key: 'q1', label: 'Quick Wins (High Impact / Low Effort)', archetype: 'service-box', dx: -210, dy: -125, w: 290, h: 155, colorRole: 'accent' },
      { key: 'q2', label: 'Major Bets (High Impact / High Effort)', archetype: 'service-box', dx: 210, dy: -125, w: 290, h: 155, colorRole: 'primary' },
      { key: 'q3', label: 'Fill-Ins (Low Impact / Low Effort)', archetype: 'service-box', dx: -210, dy: 125, w: 290, h: 155, colorRole: 'muted' },
      { key: 'q4', label: 'Reconsider (Low Impact / High Effort)', archetype: 'service-box', dx: 210, dy: 125, w: 290, h: 155, colorRole: 'secondary' },
    ],
    edges: [{ from: 'q1', to: 'q2', label: 'scale up' }],
  },
  {
    id: 'timeline-roadmap',
    name: 'Timeline Roadmap',
    title: 'Sequential Product Roadmap & Milestones',
    description:
      'Horizontal chronological timeline showing sequential phases from Foundation to Launch with milestone callouts.',
    frameLabel: 'Timeline Roadmap',
    nodes: [
      { key: 'p1', label: 'Phase 1: Voice Core', archetype: 'service-box', dx: -400, dy: 0, colorRole: 'primary' },
      { key: 'p2', label: 'Phase 2: Semantic Design', archetype: 'service-box', dx: -135, dy: 0, colorRole: 'primary' },
      { key: 'p3', label: 'Phase 3: Vision Align', archetype: 'engine-hexagon', dx: 135, dy: 0, colorRole: 'secondary' },
      { key: 'p4', label: 'Phase 4: Zero-UI Release', archetype: 'milestone-star', dx: 400, dy: 0, colorRole: 'accent' },
    ],
    edges: [
      { from: 'p1', to: 'p2' },
      { from: 'p2', to: 'p3' },
      { from: 'p3', to: 'p4' },
    ],
  },
  {
    id: 'rag-vector-pipeline',
    name: 'Multimodal RAG Pipeline',
    title: 'Multimodal Embedding & RAG Retrieval Pipeline',
    description:
      'AI retrieval architecture showing Document/Image Ingestion, EmbeddingGemma 2 768d Encoder, Matryoshka Vector Index, Semantic Reranker, and Context Generator.',
    frameLabel: 'Multimodal RAG Pipeline',
    nodes: [
      { key: 'ingest', label: 'Text + Vision Input', archetype: 'pipeline-trapezoid', dx: -440, dy: 0, colorRole: 'primary' },
      { key: 'embed', label: 'EmbeddingGemma 2 (768d)', archetype: 'engine-hexagon', dx: -150, dy: 0, colorRole: 'secondary' },
      { key: 'index', label: 'MRL Vector Store', archetype: 'database-node', dx: 150, dy: -110, colorRole: 'accent' },
      { key: 'rerank', label: 'Cosine Router', archetype: 'decision-diamond', dx: 150, dy: 110, colorRole: 'primary' },
      { key: 'out', label: 'Canvas Action', archetype: 'milestone-star', dx: 440, dy: 0, colorRole: 'accent' },
    ],
    edges: [
      { from: 'ingest', to: 'embed', label: 'interleaved' },
      { from: 'embed', to: 'index', label: 'normalize' },
      { from: 'embed', to: 'rerank', label: 'query' },
      { from: 'index', to: 'rerank', label: 'top-k' },
      { from: 'rerank', to: 'out', label: 'execute' },
    ],
  },
  {
    id: 'event-driven-mesh',
    name: 'Event-Driven Mesh',
    title: 'Event-Driven Pub/Sub Streaming Mesh',
    description:
      'Distributed event-driven broker mesh connecting Producers, Event Bus Stream, Analytics Worker, Alert Monitor, and Audit Sink.',
    frameLabel: 'Event-Driven Mesh',
    nodes: [
      { key: 'prod', label: 'Audio Producer', archetype: 'actor-circle', dx: -420, dy: 0, colorRole: 'primary' },
      { key: 'bus', label: 'Event Stream Bus', archetype: 'pipeline-trapezoid', dx: -110, dy: 0, w: 240, h: 120, colorRole: 'secondary' },
      { key: 'w1', label: 'STT Consumer', archetype: 'engine-hexagon', dx: 240, dy: -150, colorRole: 'primary' },
      { key: 'w2', label: 'Design Engine', archetype: 'engine-hexagon', dx: 240, dy: 0, colorRole: 'accent' },
      { key: 'w3', label: 'Latency Alert', archetype: 'alert-triangle', dx: 240, dy: 155, colorRole: 'muted' },
    ],
    edges: [
      { from: 'prod', to: 'bus', label: 'publish' },
      { from: 'bus', to: 'w1', label: 'sub:pcm' },
      { from: 'bus', to: 'w2', label: 'sub:intent' },
      { from: 'bus', to: 'w3', label: 'sub:sla' },
    ],
  },
  {
    id: 'c4-system-context',
    name: 'C4 System Context',
    title: 'C4 Software Architecture Context Diagram',
    description:
      'High-level C4 model system context diagram showing the human Creator, central Canval Voice Studio, Local GPU Models, and Cloud Run Infrastructure.',
    frameLabel: 'C4 System Context',
    nodes: [
      { key: 'user', label: 'Creator (Voice Only)', archetype: 'actor-circle', dx: 0, dy: -210, colorRole: 'accent' },
      { key: 'core', label: 'Canval Zero-UI Studio', archetype: 'service-box', dx: 0, dy: 0, w: 260, h: 130, colorRole: 'primary' },
      { key: 'ml', label: 'Earlybird + Gemma 2', archetype: 'engine-hexagon', dx: -340, dy: 160, colorRole: 'secondary' },
      { key: 'cloud', label: 'Google Cloud Run', archetype: 'cloud-node', dx: 340, dy: 160, colorRole: 'primary' },
    ],
    edges: [
      { from: 'user', to: 'core', label: 'speaks naturally' },
      { from: 'core', to: 'ml', label: 'JSON-RPC stdio' },
      { from: 'core', to: 'cloud', label: 'HTTPS / WSS' },
    ],
  },
  {
    id: 'user-journey-funnel',
    name: 'User Journey Funnel',
    title: 'User Conversion & Experience Journey Funnel',
    description:
      'Four-stage user experience funnel from Landing on Canvas, Speaking First Word, Speculative Ghost Preview, to Instant Visual Diagram.',
    frameLabel: 'User Experience Journey',
    nodes: [
      { key: 's1', label: '1. Open Canvas (Zero UI)', archetype: 'pipeline-trapezoid', dx: -400, dy: 0, colorRole: 'muted' },
      { key: 's2', label: '2. Speak Utterance', archetype: 'actor-circle', dx: -135, dy: 0, colorRole: 'primary' },
      { key: 's3', label: '3. Earlybird -90ms Ghost', archetype: 'transform-rhombus', dx: 135, dy: 0, colorRole: 'secondary' },
      { key: 's4', label: '4. Live Visual Diagram', archetype: 'favorite-heart', dx: 400, dy: 0, colorRole: 'accent' },
    ],
    edges: [
      { from: 's1', to: 's2', label: 'auto-mic' },
      { from: 's2', to: 's3', label: '80ms PCM' },
      { from: 's3', to: 's4', label: 'Gemma 2' },
    ],
  },
]
