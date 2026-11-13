import type {
  TLDefaultColorStyle,
  TLDefaultDashStyle,
  TLDefaultFillStyle,
  TLDefaultFontStyle,
  TLDefaultSizeStyle,
  TLGeoShapeGeoStyle,
} from 'tldraw';

export interface AestheticEdition {
  id: string;
  catalogueNumber: string;
  title: string;
  subtitle: string;
  /** Rich exemplar text embedded with EmbeddingGemma 2 (`title: ... | text: ...`) */
  semanticPrompt: string;
  /** Whether tldraw canvas operates in dark mode */
  isDarkCanvas: boolean;
  /** Frame & Passe-Partout physical material tokens (Modern Art Frame, NO glow shaders) */
  frame: {
    roomBg: string;
    mouldingOuter: string;
    mouldingFace: string;
    mouldingInnerLip: string;
    miterLine: string;
    matPaper: string;
    innerBevelTop: string;
    innerBevelBottom: string;
    canvasPaper: string;
    placardInk: string;
    placardMuted: string;
    placardGhost: string;
    placardRule: string;
    accentTick: string;
  };
  /** Default tldraw styling tokens for this aesthetic */
  tokens: {
    primaryColor: TLDefaultColorStyle;
    secondaryColor: TLDefaultColorStyle;
    accentColor: TLDefaultColorStyle;
    mutedColor: TLDefaultColorStyle;
    connectorColor: TLDefaultColorStyle;
    palette: TLDefaultColorStyle[];
    dash: TLDefaultDashStyle;
    fill: TLDefaultFillStyle;
    accentFill: TLDefaultFillStyle;
    font: TLDefaultFontStyle;
    headingFont: TLDefaultFontStyle;
    size: TLDefaultSizeStyle;
    arrowKind: 'arc' | 'elbow';
    arrowBend: number;
    arrowheadEnd: 'arrow' | 'triangle' | 'dot' | 'diamond' | 'bar';
    gapX: number;
    gapY: number;
  };
}

export const AESTHETIC_EDITIONS: AestheticEdition[] = [
  {
    id: 'bauhaus-archive',
    catalogueNumber: 'NO. 01',
    title: 'WEIMAR WERKBUND',
    subtitle: 'Ebonized Oak & Archival Cotton',
    semanticPrompt:
      'Bauhaus geometric modernism, Weimar Werkbund museum exhibition poster, primary red blue yellow with stark black geometric lines on warm museum cotton paper, bold Constructivist modernist graphic design',
    isDarkCanvas: false,
    frame: {
      roomBg: '#121110',
      mouldingOuter: '#1A1816',
      mouldingFace: '#272421',
      mouldingInnerLip: '#0F0E0D',
      miterLine: 'rgba(255, 250, 240, 0.14)',
      matPaper: '#EFEAE0',
      innerBevelTop: '#C9C1B2',
      innerBevelBottom: '#FCF9F2',
      canvasPaper: '#F8F5EE',
      placardInk: '#191816',
      placardMuted: '#6D675E',
      placardGhost: '#A39C90',
      placardRule: '#D5CEC0',
      accentTick: '#C83228',
    },
    tokens: {
      primaryColor: 'black',
      secondaryColor: 'blue',
      accentColor: 'red',
      mutedColor: 'yellow',
      connectorColor: 'black',
      palette: ['black', 'red', 'blue', 'yellow'],
      dash: 'solid',
      fill: 'lined-fill',
      accentFill: 'solid',
      font: 'sans',
      headingFont: 'sans',
      size: 'm',
      arrowKind: 'elbow',
      arrowBend: 0,
      arrowheadEnd: 'triangle',
      gapX: 250,
      gapY: 165,
    },
  },
  {
    id: 'kyoto-washi',
    catalogueNumber: 'NO. 02',
    title: 'KYOTO SUMI & WASHI',
    subtitle: 'Smoked Hinoki & Kozo Mulberry',
    semanticPrompt:
      'Japanese Kyoto sumi ink wash on warm handmade kozo mulberry washi paper, organic brush calligraphy, zen calm minimal studio craft, warm terracotta persimmon and moss ink tones, poetic literary aesthetic',
    isDarkCanvas: false,
    frame: {
      roomBg: '#171412',
      mouldingOuter: '#2E231B',
      mouldingFace: '#3E3025',
      mouldingInnerLip: '#1F1711',
      miterLine: 'rgba(255, 238, 215, 0.15)',
      matPaper: '#E9DFCE',
      innerBevelTop: '#C3B59E',
      innerBevelBottom: '#F7F1E5',
      canvasPaper: '#F4EDE0',
      placardInk: '#26201B',
      placardMuted: '#736657',
      placardGhost: '#A69886',
      placardRule: '#D1C4AE',
      accentTick: '#B84A27',
    },
    tokens: {
      primaryColor: 'black',
      secondaryColor: 'orange',
      accentColor: 'green',
      mutedColor: 'grey',
      connectorColor: 'black',
      palette: ['black', 'orange', 'green', 'grey'],
      dash: 'draw',
      fill: 'semi',
      accentFill: 'semi',
      font: 'serif',
      headingFont: 'serif',
      size: 'm',
      arrowKind: 'arc',
      arrowBend: 28,
      arrowheadEnd: 'arrow',
      gapX: 260,
      gapY: 175,
    },
  },
  {
    id: 'swiss-grid',
    catalogueNumber: 'NO. 03',
    title: 'BASEL KUNSTHALLE',
    subtitle: 'Anodized Aluminum & Gallery Rag',
    semanticPrompt:
      'Swiss International Typographic Style, Josef Muller-Brockmann Basel Kunsthalle clean white minimal architectural diagram, crisp SaaS product wireframe, hairline grid precision, ultra clean monochrome with vermilion accent',
    isDarkCanvas: false,
    frame: {
      roomBg: '#18191B',
      mouldingOuter: '#B8BCC2',
      mouldingFace: '#D2D6DC',
      mouldingInnerLip: '#8F949C',
      miterLine: 'rgba(20, 22, 25, 0.22)',
      matPaper: '#F4F5F6',
      innerBevelTop: '#CFD2D6',
      innerBevelBottom: '#FFFFFF',
      canvasPaper: '#FFFFFF',
      placardInk: '#111214',
      placardMuted: '#636870',
      placardGhost: '#9CA1AA',
      placardRule: '#DFE2E6',
      accentTick: '#E02D2D',
    },
    tokens: {
      primaryColor: 'black',
      secondaryColor: 'grey',
      accentColor: 'red',
      mutedColor: 'light-blue',
      connectorColor: 'black',
      palette: ['black', 'grey', 'red', 'blue'],
      dash: 'solid',
      fill: 'none',
      accentFill: 'lined-fill',
      font: 'sans',
      headingFont: 'sans',
      size: 's',
      arrowKind: 'elbow',
      arrowBend: 0,
      arrowheadEnd: 'arrow',
      gapX: 265,
      gapY: 160,
    },
  },
  {
    id: 'cyanotype-blueprint',
    catalogueNumber: 'NO. 04',
    title: 'ATELIER CYANOTYPE',
    subtitle: 'Prussian Lacquer & Drafting Linen',
    semanticPrompt:
      'Architectural blueprint cyanotype technical schematic, Prussian indigo engineering drawing, white and cyan monospace drafting lines, CAD system architecture floorplan and circuit diagram',
    isDarkCanvas: true,
    frame: {
      roomBg: '#090F17',
      mouldingOuter: '#122236',
      mouldingFace: '#1A304C',
      mouldingInnerLip: '#0B1624',
      miterLine: 'rgba(180, 215, 255, 0.18)',
      matPaper: '#E2EBF3',
      innerBevelTop: '#AEBFD0',
      innerBevelBottom: '#F7FAFC',
      canvasPaper: '#0E2238',
      placardInk: '#102338',
      placardMuted: '#4F6680',
      placardGhost: '#889EB5',
      placardRule: '#C4D3E2',
      accentTick: '#2563EB',
    },
    tokens: {
      primaryColor: 'light-blue',
      secondaryColor: 'white',
      accentColor: 'yellow',
      mutedColor: 'blue',
      connectorColor: 'light-blue',
      palette: ['light-blue', 'white', 'blue', 'yellow'],
      dash: 'dashed',
      fill: 'semi',
      accentFill: 'lined-fill',
      font: 'mono',
      headingFont: 'mono',
      size: 's',
      arrowKind: 'elbow',
      arrowBend: 0,
      arrowheadEnd: 'diamond',
      gapX: 260,
      gapY: 165,
    },
  },
  {
    id: 'obsidian-monolith',
    catalogueNumber: 'NO. 05',
    title: 'OBSIDIAN MONOLITH',
    subtitle: 'Basalt Stone & Carbon Museum Mat',
    semanticPrompt:
      'Dark mode brutalist obsidian monolith terminal, high contrast dark charcoal slate gallery with luminous chalk white emerald and violet accents, nocturnal hacker cybernetic matrix aesthetic',
    isDarkCanvas: true,
    frame: {
      roomBg: '#070708',
      mouldingOuter: '#141416',
      mouldingFace: '#1E1E22',
      mouldingInnerLip: '#0A0A0C',
      miterLine: 'rgba(255, 255, 255, 0.12)',
      matPaper: '#1B1B1E',
      innerBevelTop: '#0B0B0D',
      innerBevelBottom: '#2B2B30',
      canvasPaper: '#111113',
      placardInk: '#ECECEF',
      placardMuted: '#8E8E98',
      placardGhost: '#565660',
      placardRule: '#2B2B31',
      accentTick: '#34D399',
    },
    tokens: {
      primaryColor: 'white',
      secondaryColor: 'light-violet',
      accentColor: 'light-green',
      mutedColor: 'grey',
      connectorColor: 'grey',
      palette: ['white', 'light-violet', 'light-green', 'yellow'],
      dash: 'solid',
      fill: 'semi',
      accentFill: 'solid',
      font: 'mono',
      headingFont: 'sans',
      size: 'm',
      arrowKind: 'elbow',
      arrowBend: 0,
      arrowheadEnd: 'dot',
      gapX: 255,
      gapY: 165,
    },
  },
  {
    id: 'travertine-editorial',
    catalogueNumber: 'NO. 06',
    title: 'MILAN TRAVERTINE',
    subtitle: 'Roman Travertine & Cream Vellum',
    semanticPrompt:
      'Italian Milan editorial magazine spread, warm Roman limestone travertine and cream vellum, soft pastel sage lavender and warm ochre cards, classic serif typography, gentle refined luxury presentation',
    isDarkCanvas: false,
    frame: {
      roomBg: '#191714',
      mouldingOuter: '#C8Bca8',
      mouldingFace: '#DDD3C1',
      mouldingInnerLip: '#A89B86',
      miterLine: 'rgba(60, 48, 34, 0.18)',
      matPaper: '#F5EFE4',
      innerBevelTop: '#D4C9B6',
      innerBevelBottom: '#FFFDFA',
      canvasPaper: '#FAF6EE',
      placardInk: '#2B251E',
      placardMuted: '#786D5F',
      placardGhost: '#ADA292',
      placardRule: '#DFD6C7',
      accentTick: '#7C5CFC',
    },
    tokens: {
      primaryColor: 'violet',
      secondaryColor: 'green',
      accentColor: 'orange',
      mutedColor: 'light-violet',
      connectorColor: 'grey',
      palette: ['violet', 'light-green', 'orange', 'light-violet'],
      dash: 'solid',
      fill: 'lined-fill',
      accentFill: 'semi',
      font: 'serif',
      headingFont: 'serif',
      size: 'm',
      arrowKind: 'arc',
      arrowBend: 18,
      arrowheadEnd: 'arrow',
      gapX: 265,
      gapY: 175,
    },
  },
  {
    id: 'chalkboard-atelier',
    catalogueNumber: 'NO. 07',
    title: 'ECOLE BLACKBOARD',
    subtitle: 'Oiled Walnut & Schoolhouse Slate',
    semanticPrompt:
      'Hand-drawn chalkboard whiteboard sketch, rough chalk strokes on deep green-black schoolhouse slate, informal brainstorm mindmap lecture notes, playful sketchy hand-lettered diagrams',
    isDarkCanvas: true,
    frame: {
      roomBg: '#100E0C',
      mouldingOuter: '#3B2819',
      mouldingFace: '#523824',
      mouldingInnerLip: '#26190F',
      miterLine: 'rgba(255, 230, 200, 0.15)',
      matPaper: '#232926',
      innerBevelTop: '#111513',
      innerBevelBottom: '#333C37',
      canvasPaper: '#18211D',
      placardInk: '#E6ECE8',
      placardMuted: '#92A098',
      placardGhost: '#5A6860',
      placardRule: '#2F3834',
      accentTick: '#FACC15',
    },
    tokens: {
      primaryColor: 'white',
      secondaryColor: 'yellow',
      accentColor: 'light-red',
      mutedColor: 'light-blue',
      connectorColor: 'white',
      palette: ['white', 'yellow', 'light-red', 'light-blue', 'light-green'],
      dash: 'draw',
      fill: 'semi',
      accentFill: 'pattern',
      font: 'draw',
      headingFont: 'draw',
      size: 'm',
      arrowKind: 'arc',
      arrowBend: 34,
      arrowheadEnd: 'arrow',
      gapX: 260,
      gapY: 175,
    },
  },
  {
    id: 'rams-industrial',
    catalogueNumber: 'NO. 08',
    title: 'KRONBERG INDUSTRIAL',
    subtitle: 'Bead-Blasted Titanium & Pebble Mat',
    semanticPrompt:
      'Dieter Rams Braun functionalist industrial design, warm pebble grey housing with Braun signal orange and forest green indicators, clean technical hardware product design diagram',
    isDarkCanvas: false,
    frame: {
      roomBg: '#161615',
      mouldingOuter: '#7A7B78',
      mouldingFace: '#949692',
      mouldingInnerLip: '#5B5C59',
      miterLine: 'rgba(20, 20, 18, 0.22)',
      matPaper: '#E7E7E2',
      innerBevelTop: '#C5C5BE',
      innerBevelBottom: '#F9F9F6',
      canvasPaper: '#F1F1EC',
      placardInk: '#1D1E1C',
      placardMuted: '#666863',
      placardGhost: '#9B9D97',
      placardRule: '#D2D2CB',
      accentTick: '#EA580C',
    },
    tokens: {
      primaryColor: 'black',
      secondaryColor: 'grey',
      accentColor: 'orange',
      mutedColor: 'green',
      connectorColor: 'grey',
      palette: ['black', 'orange', 'green', 'grey'],
      dash: 'solid',
      fill: 'lined-fill',
      accentFill: 'solid',
      font: 'mono',
      headingFont: 'sans',
      size: 's',
      arrowKind: 'elbow',
      arrowBend: 0,
      arrowheadEnd: 'bar',
      gapX: 250,
      gapY: 155,
    },
  },
];

export type IntentKind =
  | 'create_shape'
  | 'compose_layout'
  | 'apply_aesthetic'
  | 'connect_shapes'
  | 'style_color'
  | 'style_stroke_fill'
  | 'transform_move'
  | 'transform_move_relative'
  | 'transform_swap'
  | 'transform_scale'
  | 'transform_arrange'
  | 'transform_duplicate'
  | 'animate_shapes'
  | 'stop_animation'
  | 'lock_shapes'
  | 'unlock_shapes'
  | 'edit_label'
  | 'select_target'
  | 'delete_shapes'
  | 'clear_canvas'
  | 'history_undo'
  | 'history_redo'
  | 'camera_zoom_in'
  | 'camera_zoom_out'
  | 'camera_fit';

export interface IntentPrototype {
  id: string;
  kind: IntentKind;
  title: string;
  exemplars: string;
  /** Safe to render as translucent ghost shapes during live speech */
  speculativeSafe: boolean;
}

export const INTENT_PROTOTYPES: IntentPrototype[] = [
  {
    id: 'intent-create-single',
    kind: 'create_shape',
    title: 'Create or draw shapes, boxes, circles, notes, or text on canvas',
    exemplars:
      'draw a box, add a rectangle, create three circles, put a sticky note here, place a diamond decision node, add a headline text, draw a star, create a card called authentication, drop two clouds',
    speculativeSafe: true,
  },
  {
    id: 'intent-compose-architecture',
    kind: 'compose_layout',
    title: 'Compose multi-node diagram, flowchart, architecture, mindmap, kanban, matrix, or timeline layout',
    exemplars:
      'draw a system architecture diagram, sketch a four step onboarding flowchart, create a mindmap brainstorm, build a kanban board with todo doing done, make a two by two quadrant matrix, create a project roadmap timeline, mobile bento wireframe layout',
    speculativeSafe: true,
  },
  {
    id: 'intent-apply-aesthetic',
    kind: 'apply_aesthetic',
    title: 'Change visual design aesthetic, art direction, palette, vibe, theme, or gallery frame',
    exemplars:
      'make the visual design Bauhaus modernist, switch to Kyoto Japanese ink wash style, give it a dark obsidian brutalist vibe, blueprint cyanotype schematic theme, clean Swiss Kunsthalle minimalist look, chalkboard sketch aesthetic, warm Milan editorial palette, Dieter Rams industrial theme',
    speculativeSafe: false,
  },
  {
    id: 'intent-connect',
    kind: 'connect_shapes',
    title: 'Connect, link, or wire shapes together with arrows',
    exemplars:
      'connect the first box to the second box, draw an arrow from login to database, link them all together in sequence, wire client to api gateway, point from alpha to beta',
    speculativeSafe: false,
  },
  {
    id: 'intent-style-color',
    kind: 'style_color',
    title: 'Change color, tint, or paint of shapes',
    exemplars:
      'make it blue, color them crimson red, paint that card emerald green, turn the circle yellow, change color to violet purple, make everything orange',
    speculativeSafe: false,
  },
  {
    id: 'intent-style-stroke-fill',
    kind: 'style_stroke_fill',
    title: 'Change stroke dash, fill, font, hand-drawn sketchiness, or outline style',
    exemplars:
      'make the lines dashed, use hand drawn sketchy strokes, make it solid filled, hollow outline no fill, change font to serif, use monospace font, dotted border',
    speculativeSafe: false,
  },
  {
    id: 'intent-move',
    kind: 'transform_move',
    title: 'Move, shift, nudge, slide, or reposition shapes to a direction or corner on the canvas',
    exemplars:
      'move it to the right, nudge that up a bit, shift everything left, push it down, move to the center of the canvas, put that circle in the top right corner, slide it to the bottom left, bring it to the top',
    speculativeSafe: false,
  },
  {
    id: 'intent-move-relative',
    kind: 'transform_move_relative',
    title: 'Place or move one shape relative to another shape (above, below, next to, left of, right of)',
    exemplars:
      'move the database above the API gateway, put the circle next to the rectangle, place login to the left of core engine, move the sticky note underneath the card, bring moon beside earth',
    speculativeSafe: false,
  },
  {
    id: 'intent-swap',
    kind: 'transform_swap',
    title: 'Swap or exchange the positions of two shapes on the canvas',
    exemplars:
      'swap the first box and the last box, switch the positions of alpha and beta, trade places between client and server, flip their positions',
    speculativeSafe: false,
  },
  {
    id: 'intent-animate',
    kind: 'animate_shapes',
    title: 'Animate shapes with continuous motion: orbit, float, pulse, breathe, spin, rotate, bounce, wiggle, swing, or dance',
    exemplars:
      'animate this shape, make the circle orbit around the square, make everything float gently in zero gravity, pulse like a heartbeat, spin the diamond slowly, make that star bounce up and down, wiggle the sticky note, swing like a pendulum, dance in a figure eight, glide back and forth',
    speculativeSafe: false,
  },
  {
    id: 'intent-stop-animation',
    kind: 'stop_animation',
    title: 'Stop, freeze, pause, or halt shape animations on the canvas',
    exemplars:
      'stop animating, freeze everything, pause the animation, stop spinning, hold still, calm everything down, stop motion',
    speculativeSafe: false,
  },
  {
    id: 'intent-lock',
    kind: 'lock_shapes',
    title: 'Lock or pin shapes in place so they cannot be deleted or moved accidentally',
    exemplars:
      'lock that shape, pin this card in place, protect all shapes, freeze position so it stays put',
    speculativeSafe: false,
  },
  {
    id: 'intent-unlock',
    kind: 'unlock_shapes',
    title: 'Unlock or unpin shapes so they can be edited again',
    exemplars:
      'unlock everything, unpin that box, unlock all shapes',
    speculativeSafe: false,
  },
  {
    id: 'intent-scale',
    kind: 'transform_scale',
    title: 'Resize, scale bigger, make larger, or shrink smaller',
    exemplars:
      'make it bigger, scale it up, double the size, make them smaller, shrink that box, wider card',
    speculativeSafe: false,
  },
  {
    id: 'intent-arrange',
    kind: 'transform_arrange',
    title: 'Align, tidy, stack, distribute, or arrange shapes into a row, column, or grid',
    exemplars:
      'align everything in a neat horizontal row, stack them vertically in a column, tidy into a clean grid, distribute evenly, organize the layout neatly',
    speculativeSafe: false,
  },
  {
    id: 'intent-duplicate',
    kind: 'transform_duplicate',
    title: 'Duplicate, clone, or copy shapes',
    exemplars: 'duplicate that shape, make a copy of this card, clone it three times',
    speculativeSafe: false,
  },
  {
    id: 'intent-edit-label',
    kind: 'edit_label',
    title: 'Rename, label, caption, or write text inside an existing shape',
    exemplars: 'label it API Gateway, rename that box to Postgres, change the text to Launch Plan, title it Overview',
    speculativeSafe: false,
  },
  {
    id: 'intent-select',
    kind: 'select_target',
    title: 'Select or highlight shapes on the canvas',
    exemplars: 'select everything, select all shapes, highlight the database card, select the blue circles',
    speculativeSafe: false,
  },
  {
    id: 'intent-delete',
    kind: 'delete_shapes',
    title: 'Delete, remove, or erase specific or selected shapes',
    exemplars: 'delete that, remove the selected box, erase the last circle, get rid of that card',
    speculativeSafe: false,
  },
  {
    id: 'intent-clear',
    kind: 'clear_canvas',
    title: 'Clear, wipe, or reset the entire canvas blank',
    exemplars: 'clear the canvas, wipe everything clean, start over with a blank page, erase all',
    speculativeSafe: false,
  },
  {
    id: 'intent-undo',
    kind: 'history_undo',
    title: 'Undo the previous action or step back',
    exemplars: 'undo, undo that, go back one step, revert last change',
    speculativeSafe: false,
  },
  {
    id: 'intent-redo',
    kind: 'history_redo',
    title: 'Redo the undone action',
    exemplars: 'redo, redo that, bring it back',
    speculativeSafe: false,
  },
  {
    id: 'intent-zoom-in',
    kind: 'camera_zoom_in',
    title: 'Zoom in closer on the canvas',
    exemplars: 'zoom in, closer view, magnify the canvas',
    speculativeSafe: false,
  },
  {
    id: 'intent-zoom-out',
    kind: 'camera_zoom_out',
    title: 'Zoom out to see wider canvas',
    exemplars: 'zoom out, step back, wider view',
    speculativeSafe: false,
  },
  {
    id: 'intent-camera-fit',
    kind: 'camera_fit',
    title: 'Fit all shapes into view or center camera on the artwork',
    exemplars: 'fit everything on screen, zoom to fit, center the view, show the whole diagram, frame everything',
    speculativeSafe: false,
  },
];

export type BlueprintKind =
  | 'architecture'
  | 'flowchart'
  | 'mindmap'
  | 'kanban'
  | 'quadrant'
  | 'timeline'
  | 'bento'
  | 'row'
  | 'column';

export interface LayoutBlueprint {
  id: BlueprintKind;
  title: string;
  exemplars: string;
  defaultNodes: { label: string; geo: TLGeoShapeGeoStyle | 'note'; role: 'primary' | 'secondary' | 'accent' | 'muted' }[];
}

export const LAYOUT_BLUEPRINTS: LayoutBlueprint[] = [
  {
    id: 'architecture',
    title: 'System architecture pipeline with client, gateway, service, and database tiers',
    exemplars:
      'system architecture diagram, backend microservice pipeline, client api server database stack, cloud infrastructure topology, three tier web app architecture',
    defaultNodes: [
      { label: 'Mobile Client', geo: 'oval', role: 'secondary' },
      { label: 'API Gateway', geo: 'hexagon', role: 'primary' },
      { label: 'Core Engine', geo: 'rectangle', role: 'accent' },
      { label: 'Vector Store', geo: 'trapezoid', role: 'muted' },
    ],
  },
  {
    id: 'flowchart',
    title: 'Sequential process flowchart with steps and decision diamond',
    exemplars:
      'process flowchart, user onboarding journey steps, login workflow diagram, decision tree funnel, step by step sequence with arrows',
    defaultNodes: [
      { label: 'Voice Input', geo: 'oval', role: 'secondary' },
      { label: 'Parse Intent', geo: 'rectangle', role: 'primary' },
      { label: 'High Confidence?', geo: 'diamond', role: 'accent' },
      { label: 'Render Canvas', geo: 'rectangle', role: 'primary' },
    ],
  },
  {
    id: 'mindmap',
    title: 'Radial brainstorm mindmap with central thesis and surrounding concept branches',
    exemplars:
      'mindmap brainstorm, radial concept map, central idea with branches, hub and spoke diagram, topic cluster web',
    defaultNodes: [
      { label: 'Core Thesis', geo: 'ellipse', role: 'accent' },
      { label: 'Form', geo: 'rectangle', role: 'primary' },
      { label: 'Voice', geo: 'rectangle', role: 'secondary' },
      { label: 'Motion', geo: 'rectangle', role: 'primary' },
      { label: 'Craft', geo: 'rectangle', role: 'muted' },
    ],
  },
  {
    id: 'kanban',
    title: 'Three-column Kanban board with backlog, active, and complete cards',
    exemplars:
      'kanban board, three columns todo doing done, sprint task board, project columns workflow, sticky note board',
    defaultNodes: [
      { label: 'QUEUED', geo: 'rectangle', role: 'muted' },
      { label: 'IN FLIGHT', geo: 'rectangle', role: 'accent' },
      { label: 'SHIPPED', geo: 'rectangle', role: 'secondary' },
    ],
  },
  {
    id: 'quadrant',
    title: 'Two-by-two 2x2 matrix quadrant grid for strategic comparison',
    exemplars:
      'two by two matrix, 2x2 quadrant chart, impact effort matrix, pros and cons four box comparison grid, swot analysis',
    defaultNodes: [
      { label: 'High Craft · Fast', geo: 'rectangle', role: 'accent' },
      { label: 'High Craft · Deep', geo: 'rectangle', role: 'primary' },
      { label: 'Quick Sketch', geo: 'rectangle', role: 'secondary' },
      { label: 'Archive', geo: 'rectangle', role: 'muted' },
    ],
  },
  {
    id: 'timeline',
    title: 'Horizontal milestone timeline or chronological roadmap',
    exemplars:
      'project timeline, four milestone roadmap, chronological phases, launch schedule horizon, release phases',
    defaultNodes: [
      { label: 'I · Concept', geo: 'oval', role: 'secondary' },
      { label: 'II · Prototype', geo: 'oval', role: 'primary' },
      { label: 'III · Refine', geo: 'oval', role: 'primary' },
      { label: 'IV · Exhibition', geo: 'oval', role: 'accent' },
    ],
  },
  {
    id: 'bento',
    title: 'Modular bento dashboard grid or mobile app UI wireframe',
    exemplars:
      'bento box grid, dashboard layout wireframe, mobile screen layout cards, hero header and feature cards',
    defaultNodes: [
      { label: 'Hero Canvas', geo: 'rectangle', role: 'primary' },
      { label: 'Voice Stream', geo: 'rectangle', role: 'accent' },
      { label: 'Style Vectors', geo: 'rectangle', role: 'secondary' },
      { label: 'Edition Plate', geo: 'rectangle', role: 'muted' },
    ],
  },
  {
    id: 'row',
    title: 'Horizontal row of shapes side by side',
    exemplars: 'in a horizontal row, side by side in a line, across from left to right',
    defaultNodes: [],
  },
  {
    id: 'column',
    title: 'Vertical stack or column of shapes from top to bottom',
    exemplars: 'in a vertical stack, column from top to bottom, stacked underneath each other',
    defaultNodes: [],
  },
];

export interface ShapeArchetype {
  id: string;
  shapeType: 'geo' | 'note' | 'text' | 'frame';
  geo?: TLGeoShapeGeoStyle;
  w: number;
  h: number;
  role: 'primary' | 'secondary' | 'accent' | 'muted';
  title: string;
  exemplars: string;
}

export const SHAPE_ARCHETYPES: ShapeArchetype[] = [
  {
    id: 'arch-card',
    shapeType: 'geo',
    geo: 'rectangle',
    w: 200,
    h: 110,
    role: 'primary',
    title: 'Rectangle, box, card, block, module, service, or screen',
    exemplars: 'box, rectangle, card, square, block, container, component, service node, module, panel',
  },
  {
    id: 'arch-circle',
    shapeType: 'geo',
    geo: 'ellipse',
    w: 140,
    h: 140,
    role: 'secondary',
    title: 'Circle, orb, sphere, dot, hub, or round node',
    exemplars: 'circle, round orb, sphere, bubble, point, hub, node, loop',
  },
  {
    id: 'arch-pill',
    shapeType: 'geo',
    geo: 'oval',
    w: 190,
    h: 82,
    role: 'secondary',
    title: 'Pill, badge, terminal start/end capsule, button, or tag',
    exemplars: 'pill, capsule, oval, rounded badge, start node, endpoint, user actor, client',
  },
  {
    id: 'arch-diamond',
    shapeType: 'geo',
    geo: 'diamond',
    w: 165,
    h: 150,
    role: 'accent',
    title: 'Diamond, decision gate, router, branch, or condition',
    exemplars: 'diamond, rhombus, decision node, condition check, gateway branch, router',
  },
  {
    id: 'arch-hexagon',
    shapeType: 'geo',
    geo: 'hexagon',
    w: 175,
    h: 140,
    role: 'primary',
    title: 'Hexagon, engine, processor, microservice, or worker',
    exemplars: 'hexagon, polygon, processor, worker, model engine, transformer, api gateway',
  },
  {
    id: 'arch-database',
    shapeType: 'geo',
    geo: 'trapezoid',
    w: 185,
    h: 115,
    role: 'muted',
    title: 'Database, storage bucket, warehouse, queue, or index',
    exemplars: 'database, storage, sql postgres, vector store, bucket, cache, memory bank, trapezoid',
  },
  {
    id: 'arch-cloud',
    shapeType: 'geo',
    geo: 'cloud',
    w: 210,
    h: 130,
    role: 'secondary',
    title: 'Cloud, internet, external network, or atmosphere',
    exemplars: 'cloud, network, internet, external service, thought cloud, sky',
  },
  {
    id: 'arch-triangle',
    shapeType: 'geo',
    geo: 'triangle',
    w: 150,
    h: 140,
    role: 'accent',
    title: 'Triangle, pyramid, delta, warning, or peak',
    exemplars: 'triangle, pyramid, warning alert, delta, hierarchy peak, wedge',
  },
  {
    id: 'arch-star',
    shapeType: 'geo',
    geo: 'star',
    w: 145,
    h: 145,
    role: 'accent',
    title: 'Star, spark, highlight, north star, or favorite',
    exemplars: 'star, sparkle, milestone badge, north star, highlight emblem',
  },
  {
    id: 'arch-heart',
    shapeType: 'geo',
    geo: 'heart',
    w: 135,
    h: 130,
    role: 'accent',
    title: 'Heart, love, health, or empathy symbol',
    exemplars: 'heart, love, favorite, care, pulse',
  },
  {
    id: 'arch-sticky',
    shapeType: 'note',
    w: 200,
    h: 200,
    role: 'accent',
    title: 'Sticky note, post-it memo, comment, or brainstorm note',
    exemplars: 'sticky note, post it, memo, reminder note, yellow square note, annotation',
  },
  {
    id: 'arch-text',
    shapeType: 'text',
    w: 260,
    h: 60,
    role: 'primary',
    title: 'Typography, title, heading, quote, caption, or text label',
    exemplars: 'heading, title text, standalone quote, typography, caption, write words',
  },
  {
    id: 'arch-frame',
    shapeType: 'frame',
    w: 480,
    h: 320,
    role: 'muted',
    title: 'Section frame, artboard, container boundary, or group box',
    exemplars: 'artboard, section frame, group boundary, stage container, viewport box',
  },
];

export interface ColorPrototype {
  id: string;
  color: TLDefaultColorStyle;
  title: string;
  exemplars: string;
}

export const COLOR_PROTOTYPES: ColorPrototype[] = [
  { id: 'col-black', color: 'black', title: 'Black, ink, charcoal, onyx, obsidian', exemplars: 'black, dark ink, charcoal, ebony, onyx' },
  { id: 'col-grey', color: 'grey', title: 'Grey, silver, slate, stone, neutral', exemplars: 'grey, gray, silver, slate, neutral stone, pewter' },
  { id: 'col-white', color: 'white', title: 'White, chalk, ivory, cream, snow', exemplars: 'white, chalk, ivory, milk, alabaster, snow' },
  { id: 'col-red', color: 'red', title: 'Red, crimson, vermilion, scarlet, ruby', exemplars: 'red, crimson, vermilion, scarlet, ruby, burgundy, coral' },
  { id: 'col-light-red', color: 'light-red', title: 'Pink, rose, blush, salmon', exemplars: 'pink, rose, blush, salmon, soft red, coral pink' },
  { id: 'col-orange', color: 'orange', title: 'Orange, terracotta, amber, rust, copper', exemplars: 'orange, terracotta, rust, amber, tangerine, copper, persimmon' },
  { id: 'col-yellow', color: 'yellow', title: 'Yellow, gold, ochre, mustard, lemon', exemplars: 'yellow, gold, golden, ochre, mustard, lemon, sun' },
  { id: 'col-green', color: 'green', title: 'Green, emerald, forest, jade, pine', exemplars: 'green, emerald, forest green, jade, pine, olive, moss' },
  { id: 'col-light-green', color: 'light-green', title: 'Mint, sage, lime, pistachio', exemplars: 'mint, sage, light green, lime, seafoam, pistachio' },
  { id: 'col-blue', color: 'blue', title: 'Blue, cobalt, navy, ultramarine, indigo', exemplars: 'blue, cobalt, navy, indigo, ultramarine, sapphire, ocean' },
  { id: 'col-light-blue', color: 'light-blue', title: 'Sky blue, cyan, azure, ice, teal', exemplars: 'sky blue, light blue, cyan, azure, turquoise, ice blue,cerulean' },
  { id: 'col-violet', color: 'violet', title: 'Violet, purple, plum, amethyst, royal', exemplars: 'violet, purple, plum, amethyst, magenta, grape' },
  { id: 'col-light-violet', color: 'light-violet', title: 'Lavender, lilac, orchid, periwinkle', exemplars: 'lavender, lilac, pastel purple, orchid, periwinkle' },
];

export type CatalogAnimationKind =
  | 'float'
  | 'orbit'
  | 'pulse'
  | 'spin'
  | 'bounce'
  | 'wiggle'
  | 'pendulum'
  | 'figure8'
  | 'drift'
  | 'stop';

export interface AnimationPrototype {
  id: string;
  anim: CatalogAnimationKind;
  title: string;
  exemplars: string;
}

export const ANIMATION_PROTOTYPES: AnimationPrototype[] = [
  {
    id: 'anim-float',
    anim: 'float',
    title: 'Gentle levitation, floating, hovering, zero gravity bobbing',
    exemplars: 'float gently, levitate in air, hover softly, bob up and down, zero gravity drift, weightless motion',
  },
  {
    id: 'anim-orbit',
    anim: 'orbit',
    title: 'Planetary orbit, circular revolution around a center or another shape',
    exemplars: 'orbit around, circle around the hub, planetary revolution, revolve around that card, satellite loop',
  },
  {
    id: 'anim-pulse',
    anim: 'pulse',
    title: 'Breathing pulse, rhythmic heartbeat scale expansion and contraction',
    exemplars: 'pulse gently, breathe in and out, heartbeat throb, rhythmic glow scale, expanding pulsing node',
  },
  {
    id: 'anim-spin',
    anim: 'spin',
    title: 'Continuous 360 degree rotation, spinning clockwise or counterclockwise',
    exemplars: 'spin around, rotate continuously, turn like a wheel, twirl, clockwork rotation',
  },
  {
    id: 'anim-bounce',
    anim: 'bounce',
    title: 'Playful elastic bounce, jumping up and down with gravity',
    exemplars: 'bounce up and down, hop playfully, jump, rubber ball bounce, springy motion',
  },
  {
    id: 'anim-wiggle',
    anim: 'wiggle',
    title: 'Energetic wiggle, shake, jitter, or vibration',
    exemplars: 'wiggle, shake, vibrate, jitter energetically, buzz, shimmy',
  },
  {
    id: 'anim-pendulum',
    anim: 'pendulum',
    title: 'Harmonic pendulum swing, swaying side to side from above',
    exemplars: 'swing like a pendulum, sway back and forth, cradle swing, rocking motion',
  },
  {
    id: 'anim-figure8',
    anim: 'figure8',
    title: 'Figure-eight Lissajous loop, infinity path dance, weaving trajectory',
    exemplars: 'figure eight loop, infinity path, dance gracefully, weave in an eight, Lissajous motion',
  },
  {
    id: 'anim-drift',
    anim: 'drift',
    title: 'Smooth horizontal or vertical patrol, sliding back and forth',
    exemplars: 'patrol back and forth, slide side to side, oscillate horizontally, glide across',
  },
  {
    id: 'anim-stop',
    anim: 'stop',
    title: 'Stop animating, freeze motion, hold still, pause',
    exemplars: 'stop animating, freeze, pause motion, hold still, calm down, stop',
  },
];
