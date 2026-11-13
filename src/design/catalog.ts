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

export interface CommandIntentSpec {
  id:
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
    | 'align_shapes'
    | 'camera_control'
    | 'vision_harmonize'
    | 'undo_redo'
    | 'clear_canvas'
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
      'Draw or add a single geometric shape, box, rectangle, circle, diamond, cloud, database, service node, card, star, hexagon, or component onto the canvas.',
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
    title: 'Connect Two Shapes with Arrow',
    description:
      'Draw an arrow, line, link, dependency flow, or connection from one shape or node on the canvas to another shape.',
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
      'Build a complete diagram layout, system architecture pipeline, flowchart, mind map, Kanban board, 2x2 matrix, timeline roadmap, or brainstorm sticky cluster.',
    exemplars: [
      'generate a system architecture diagram',
      'create a decision flowchart for user onboarding',
      'draw a mind map around AI Voice Canvas',
      'build a kanban board with backlog in progress and done',
      'make a two by two priority matrix',
      'lay out a product roadmap timeline',
      'create a brainstorm cluster of sticky notes',
    ],
  },
  {
    id: 'apply_theme',
    title: 'Apply Visual Design Theme or Aesthetic Vibe',
    description:
      'Switch the overall visual design system, aesthetic vibe, color palette, typography, dark blueprint style, cyberpunk neon, warm editorial, nordic minimal, or sketchy look across the canvas.',
    exemplars: [
      'make the design look like a technical dark blueprint',
      'switch to cyberpunk neon aesthetic',
      'apply a warm editorial paper style',
      'use a hand drawn playful sketchbook vibe',
      'give it a clean nordic minimal design',
      'change the theme to botanical forest',
      'use high contrast executive styling',
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
      'center the title',
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
    id: 'camera_control',
    title: 'Zoom or Pan Canvas Camera',
    description:
      'Zoom in, zoom out, fit all shapes into the viewport, or reset the camera view.',
    exemplars: [
      'zoom out to see everything',
      'zoom in closer',
      'fit all shapes on screen',
      'center the camera view',
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
    width: 200,
    height: 115,
  },
  {
    id: 'cloud-node',
    title: 'Cloud / External Network',
    description: 'Cloud infrastructure, internet, AWS, external third-party API, CDN, or serverless cluster.',
    kind: 'geo',
    geo: 'cloud',
    defaultColor: 'light-violet',
    defaultFill: 'semi',
    width: 230,
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
    width: 190,
    height: 140,
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
    width: 215,
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
    width: 180,
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
    width: 175,
    height: 175,
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
      { key: 'client', label: 'Voice Client', archetype: 'actor-circle', dx: -420, dy: 0, colorRole: 'accent' },
      { key: 'gateway', label: 'Stream Gateway', archetype: 'pipeline-trapezoid', dx: -140, dy: 0, colorRole: 'primary' },
      { key: 'engine', label: 'Core Engine', archetype: 'engine-hexagon', dx: 150, dy: -90, colorRole: 'secondary' },
      { key: 'cache', label: 'Vector Index', archetype: 'service-box', dx: 150, dy: 95, colorRole: 'primary' },
      { key: 'db', label: 'Primary Store', archetype: 'database-node', dx: 430, dy: 0, colorRole: 'accent' },
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
      { key: 'start', label: 'Voice Input', archetype: 'actor-circle', dx: -380, dy: 0, colorRole: 'primary' },
      { key: 'parse', label: 'Embed Intent', archetype: 'service-box', dx: -120, dy: 0, colorRole: 'primary' },
      { key: 'check', label: 'Confidence > 85%?', archetype: 'decision-diamond', dx: 150, dy: 0, colorRole: 'accent' },
      { key: 'exec', label: 'Execute on Canvas', archetype: 'engine-hexagon', dx: 420, dy: -110, colorRole: 'secondary' },
      { key: 'ghost', label: 'Show Ghost Preview', archetype: 'sticky-note', dx: 420, dy: 115, colorRole: 'muted' },
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
      { key: 'center', label: 'Central Idea', archetype: 'engine-hexagon', dx: 0, dy: 0, w: 240, h: 135, colorRole: 'primary' },
      { key: 'n1', label: 'Voice UX', archetype: 'service-box', dx: -340, dy: -170, colorRole: 'secondary' },
      { key: 'n2', label: 'Visual Design', archetype: 'service-box', dx: 340, dy: -170, colorRole: 'accent' },
      { key: 'n3', label: 'Local Models', archetype: 'cloud-node', dx: -360, dy: 150, colorRole: 'secondary' },
      { key: 'n4', label: 'Zero Buttons', archetype: 'milestone-star', dx: 360, dy: 150, colorRole: 'accent' },
      { key: 'n5', label: 'Key Notes', archetype: 'sticky-note', dx: 0, dy: 250, colorRole: 'muted' },
    ],
    edges: [
      { from: 'center', to: 'n1' },
      { from: 'center', to: 'n2' },
      { from: 'center', to: 'n3' },
      { from: 'center', to: 'n4' },
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
      { key: 'col1', label: 'BACKLOG', archetype: 'service-box', dx: -320, dy: -160, w: 240, h: 80, colorRole: 'muted' },
      { key: 'c1a', label: 'Multi-modal Critique', archetype: 'sticky-note', dx: -320, dy: 30, colorRole: 'muted' },
      { key: 'col2', label: 'IN PROGRESS', archetype: 'service-box', dx: 0, dy: -160, w: 240, h: 80, colorRole: 'primary' },
      { key: 'c2a', label: 'Live Voice Canvas', archetype: 'sticky-note', dx: 0, dy: 30, colorRole: 'primary' },
      { key: 'col3', label: 'SHIPPED', archetype: 'service-box', dx: 320, dy: -160, w: 240, h: 80, colorRole: 'accent' },
      { key: 'c3a', label: 'Earlybird 80ms Stream', archetype: 'sticky-note', dx: 320, dy: 30, colorRole: 'accent' },
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
      { key: 'q1', label: 'Quick Wins (High Impact / Low Effort)', archetype: 'service-box', dx: -200, dy: -120, w: 280, h: 150, colorRole: 'accent' },
      { key: 'q2', label: 'Major Bets (High Impact / High Effort)', archetype: 'service-box', dx: 200, dy: -120, w: 280, h: 150, colorRole: 'primary' },
      { key: 'q3', label: 'Fill-Ins (Low Impact / Low Effort)', archetype: 'service-box', dx: -200, dy: 120, w: 280, h: 150, colorRole: 'muted' },
      { key: 'q4', label: 'Reconsider (Low Impact / High Effort)', archetype: 'service-box', dx: 200, dy: 120, w: 280, h: 150, colorRole: 'secondary' },
    ],
    edges: [
      { from: 'q1', to: 'q2', label: 'scale up' },
    ],
  },
  {
    id: 'timeline-roadmap',
    name: 'Timeline Roadmap',
    title: 'Sequential Product Roadmap & Milestones',
    description:
      'Horizontal chronological timeline showing sequential phases from Foundation to Launch with milestone callouts.',
    frameLabel: 'Timeline Roadmap',
    nodes: [
      { key: 'p1', label: 'Phase 1: Voice Core', archetype: 'service-box', dx: -390, dy: 0, colorRole: 'primary' },
      { key: 'p2', label: 'Phase 2: Semantic Design', archetype: 'service-box', dx: -130, dy: 0, colorRole: 'primary' },
      { key: 'p3', label: 'Phase 3: Vision Align', archetype: 'engine-hexagon', dx: 130, dy: 0, colorRole: 'secondary' },
      { key: 'p4', label: 'Phase 4: Zero-UI Release', archetype: 'milestone-star', dx: 390, dy: 0, colorRole: 'accent' },
    ],
    edges: [
      { from: 'p1', to: 'p2' },
      { from: 'p2', to: 'p3' },
      { from: 'p3', to: 'p4' },
    ],
  },
]
