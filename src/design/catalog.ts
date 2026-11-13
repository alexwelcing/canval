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
  | 'sketch_ink'
  | 'rich_text_card'
  | 'append_text'
  | 'switch_tool'
  | 'manage_page'
  | 'export_canvas'
  | 'group_ungroup'
  | 'layout_pack_stack'
  | 'transform_flip'
  | 'toggle_grid_snap'
  | 'studio_guide'
  | 'apply_aesthetic'
  | 'connect_shapes'
  | 'style_color'
  | 'style_stroke_fill'
  | 'style_arrows'
  | 'transform_move'
  | 'transform_move_relative'
  | 'transform_swap'
  | 'transform_scale'
  | 'transform_rotate'
  | 'transform_arrange'
  | 'transform_align_distribute'
  | 'transform_duplicate'
  | 'frame_group'
  | 'z_order'
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
  | 'camera_fit'
  | 'vision_harmonize';

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
    title: 'Create, draw, add, or spawn new shapes, boxes, circles, stars, notes, or text on canvas',
    exemplars:
      'draw a box, draw three circles in a row, add a rectangle, create four stars, put a sticky note right here, place a diamond decision node, add a headline text, create a card called authentication, drop two clouds, spawn five hexagons',
    speculativeSafe: true,
  },
  {
    id: 'intent-compose-architecture',
    kind: 'compose_layout',
    title: 'Compose multi-node diagram, flowchart, architecture, mindmap, kanban, matrix, sequence, table, journey, or schema layout',
    exemplars:
      'draw a system architecture diagram, sketch a four step onboarding flowchart, create a mindmap brainstorm, build a kanban board with todo doing done, make a two by two quadrant matrix, create a project roadmap timeline, sequence diagram, database schema, user journey map, three by three table',
    speculativeSafe: true,
  },
  {
    id: 'intent-sketch-ink',
    kind: 'sketch_ink',
    title: 'Sketch organic freehand ink strokes, circle around a shape, underline, cross out, spiral, wave, sparkline, divider, or checkmark',
    exemplars:
      'circle that in red ink, underline the title, cross that out, sketch a sine wave, draw a spiral, draw a horizontal divider line, sketch a sparkline trend curve, draw a green checkmark, sketch a lightning bolt, draw a smiley face, draw a curly brace',
    speculativeSafe: false,
  },
  {
    id: 'intent-rich-card',
    kind: 'rich_text_card',
    title: 'Create structured bullet list, numbered list, checklist note, or formatted code block card',
    exemplars:
      'create a bullet list called Goals with Design Build Ship, make a numbered list with Step one Step two Step three, add a checklist card with Auth Database Deploy, create a code card with const ready equals true',
    speculativeSafe: false,
  },
  {
    id: 'intent-append-text',
    kind: 'append_text',
    title: 'Append or add a new bullet item or line of text inside an existing note or card',
    exemplars:
      'append Ship to production to that note, add bullet Write tests to Goals, add item Review PR to the checklist',
    speculativeSafe: false,
  },
  {
    id: 'intent-switch-tool',
    kind: 'switch_tool',
    title: 'Switch active tldraw drawing instrument: pen, marker, highlighter, laser pointer, hand pan, eraser, arrow, or select pointer',
    exemplars:
      'pen mode, switch to red marker, ink pen, yellow highlighter, laser pointer, presentation laser, hand tool, pan mode, select tool, pointer mode, arrow tool, eraser mode',
    speculativeSafe: false,
  },
  {
    id: 'intent-manage-page',
    kind: 'manage_page',
    title: 'Create, duplicate, rename, or navigate between canvas pages and presentation slides',
    exemplars:
      'new page, create a new page called Architecture, next page, previous page, go to page one, duplicate this page, next slide, rename page to Overview',
    speculativeSafe: false,
  },
  {
    id: 'intent-export-canvas',
    kind: 'export_canvas',
    title: 'Export, download, snapshot, or copy the artwork as PNG, SVG, clipboard image, or JSON backup',
    exemplars:
      'export PNG, download SVG, save image, export diagram as vector, copy image to clipboard, take a snapshot, export JSON backup',
    speculativeSafe: false,
  },
  {
    id: 'intent-group-ungroup',
    kind: 'group_ungroup',
    title: 'Group shapes together into a native tldraw group or ungroup an existing group',
    exemplars:
      'group these shapes together, group all, ungroup that, ungroup everything',
    speculativeSafe: false,
  },
  {
    id: 'intent-pack-stack',
    kind: 'layout_pack_stack',
    title: 'Pack shapes tightly together, stack evenly, or stretch to match width, height, or same size',
    exemplars:
      'pack shapes tightly, pack them together, stack horizontally, stack vertically, stretch to same width, match height, make them the same size',
    speculativeSafe: false,
  },
  {
    id: 'intent-flip',
    kind: 'transform_flip',
    title: 'Flip or mirror shapes horizontally or vertically',
    exemplars:
      'flip horizontally, mirror horizontally, flip vertically, mirror upside down',
    speculativeSafe: false,
  },
  {
    id: 'intent-grid-snap',
    kind: 'toggle_grid_snap',
    title: 'Show or hide background dot grid or toggle magnetic snap alignment mode',
    exemplars:
      'show grid, turn on the grid, hide grid, turn off grid, enable snap mode, turn on snapping, disable snap',
    speculativeSafe: false,
  },
  {
    id: 'intent-studio-guide',
    kind: 'studio_guide',
    title: 'Show voice studio command guide, examples, or help reference card on canvas',
    exemplars:
      'what can I say, show voice commands, studio guide, show examples, help me use voice',
    speculativeSafe: false,
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
      'move it to the right, nudge that up a bit, shift everything left, push it down, move to the center of the canvas, put that circle in the top right corner, slide it to the bottom left, bring it right here',
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
  {
    id: 'intent-vision-harmonize',
    kind: 'vision_harmonize',
    title: 'Harmonize, critique, curate, or auto-style the visual composition and layout balance',
    exemplars:
      'harmonize the canvas, harmonize the design, critique the composition, curate the visual hierarchy, auto style this diagram, polish and balance the layout',
    speculativeSafe: false,
  },
  {
    id: 'intent-frame-group',
    kind: 'frame_group',
    title: 'Frame, group, wrap, or enclose existing shapes inside a labeled section artboard frame',
    exemplars:
      'put a frame around everything, group those shapes in a frame called Backend, wrap all cards inside a section box, frame this cluster as Sprint One, enclose them in an artboard',
    speculativeSafe: false,
  },
  {
    id: 'intent-rotate',
    kind: 'transform_rotate',
    title: 'Rotate, tilt, angle, turn 45 or 90 degrees, or straighten shapes',
    exemplars:
      'rotate 45 degrees, turn it 90 degrees, tilt that card slightly, flip upside down, reset rotation straight',
    speculativeSafe: false,
  },
  {
    id: 'intent-align-distribute',
    kind: 'transform_align_distribute',
    title: 'Align existing edges to top, bottom, left, right, middle, or distribute spacing evenly',
    exemplars:
      'align left edges, align top edges, align bottom, center vertically, center horizontally, distribute horizontally with equal spacing, distribute vertically evenly',
    speculativeSafe: false,
  },
  {
    id: 'intent-style-arrows',
    kind: 'style_arrows',
    title: 'Style arrows and connectors: curved arc arrows, orthogonal elbow lines, dashed connectors, or reverse direction',
    exemplars:
      'curve the arrows, make connectors curved arcs, use straight elbow arrows, make all arrows dashed, reverse the arrow direction',
    speculativeSafe: false,
  },
  {
    id: 'intent-z-order',
    kind: 'z_order',
    title: 'Change layer order: bring shapes to front or send shapes to back',
    exemplars:
      'bring that to the front, send frame to the back, put behind everything, layer on top',
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
  | 'cycle'
  | 'tree'
  | 'venn'
  | 'funnel'
  | 'neural'
  | 'orbit_system'
  | 'wireframe'
  | 'state_machine'
  | 'layers'
  | 'comparison'
  | 'sequence'
  | 'table'
  | 'journey'
  | 'er_schema'
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
      'system architecture diagram, backend microservice pipeline, client api server database stack, cloud infrastructure topology, three tier web app architecture, rag pipeline',
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
      'process flowchart, user onboarding journey steps, login workflow diagram, decision tree algorithm, step by step sequence with arrows',
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
      'mindmap brainstorm, radial concept map, central idea with branches, hub and spoke diagram, topic cluster web, explore ideas around',
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
      'kanban board, three columns todo doing done, sprint task board, project columns workflow, sticky note agile board',
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
      'two by two matrix, 2x2 quadrant chart, impact effort matrix, eisenhower urgent important matrix, swot analysis strengths weaknesses opportunities threats',
    defaultNodes: [
      { label: 'High Impact · Fast', geo: 'rectangle', role: 'accent' },
      { label: 'Strategic Bets', geo: 'rectangle', role: 'primary' },
      { label: 'Quick Wins', geo: 'rectangle', role: 'secondary' },
      { label: 'Backlog', geo: 'rectangle', role: 'muted' },
    ],
  },
  {
    id: 'timeline',
    title: 'Horizontal milestone timeline or chronological roadmap',
    exemplars:
      'project timeline, four milestone roadmap, chronological phases, launch schedule horizon, history era sequence, release phases',
    defaultNodes: [
      { label: 'I · Concept', geo: 'oval', role: 'secondary' },
      { label: 'II · Prototype', geo: 'oval', role: 'primary' },
      { label: 'III · Refine', geo: 'oval', role: 'primary' },
      { label: 'IV · Exhibition', geo: 'oval', role: 'accent' },
    ],
  },
  {
    id: 'bento',
    title: 'Modular bento dashboard grid or feature showcase cards',
    exemplars:
      'bento box grid, dashboard metrics layout, feature showcase cards, modular summary grid',
    defaultNodes: [
      { label: 'Hero Canvas', geo: 'rectangle', role: 'primary' },
      { label: 'Voice Stream', geo: 'rectangle', role: 'accent' },
      { label: 'Style Vectors', geo: 'rectangle', role: 'secondary' },
      { label: 'Edition Plate', geo: 'rectangle', role: 'muted' },
    ],
  },
  {
    id: 'cycle',
    title: 'Circular feedback loop, flywheel, lifecycle, or continuous iteration ring',
    exemplars:
      'feedback loop cycle, growth flywheel, continuous iteration loop, water cycle, build measure learn loop, circular lifecycle diagram, closed ring process',
    defaultNodes: [
      { label: 'Observe', geo: 'oval', role: 'secondary' },
      { label: 'Orient', geo: 'oval', role: 'primary' },
      { label: 'Decide', geo: 'oval', role: 'accent' },
      { label: 'Act', geo: 'oval', role: 'primary' },
    ],
  },
  {
    id: 'tree',
    title: 'Hierarchical tree diagram, org chart, taxonomy, or parent-child breakdown',
    exemplars:
      'org chart hierarchy, tree diagram, parent child taxonomy, work breakdown structure, file directory tree, family tree, company organization chart',
    defaultNodes: [
      { label: 'Principal Root', geo: 'rectangle', role: 'accent' },
      { label: 'Systems', geo: 'rectangle', role: 'primary' },
      { label: 'Design', geo: 'rectangle', role: 'secondary' },
      { label: 'Models', geo: 'rectangle', role: 'primary' },
      { label: 'Runtime', geo: 'oval', role: 'muted' },
      { label: 'Typography', geo: 'oval', role: 'muted' },
      { label: 'Inference', geo: 'oval', role: 'muted' },
    ],
  },
  {
    id: 'venn',
    title: 'Overlapping Venn diagram circles showing shared intersection of concepts',
    exemplars:
      'venn diagram, overlapping circles intersection, three circle overlap comparison, sweet spot intersection diagram, ikigai overlap',
    defaultNodes: [
      { label: 'Voice', geo: 'ellipse', role: 'primary' },
      { label: 'Design', geo: 'ellipse', role: 'secondary' },
      { label: 'Motion', geo: 'ellipse', role: 'accent' },
    ],
  },
  {
    id: 'funnel',
    title: 'Progressive top-down conversion funnel or filtering stages',
    exemplars:
      'conversion funnel, sales marketing funnel, user acquisition funnel, filtering pipeline stages, top of funnel to bottom',
    defaultNodes: [
      { label: 'Discovery', geo: 'trapezoid', role: 'secondary' },
      { label: 'Activation', geo: 'trapezoid', role: 'primary' },
      { label: 'Retention', geo: 'trapezoid', role: 'primary' },
      { label: 'Advocacy', geo: 'trapezoid', role: 'accent' },
    ],
  },
  {
    id: 'neural',
    title: 'Neural network architecture, deep learning layers, or transformer graph',
    exemplars:
      'neural network diagram, deep learning layers input hidden output, multi layer perceptron graph, machine learning model graph, transformer attention network',
    defaultNodes: [
      { label: 'Audio PCM', geo: 'ellipse', role: 'secondary' },
      { label: 'Tokens', geo: 'ellipse', role: 'secondary' },
      { label: 'Encoder', geo: 'hexagon', role: 'primary' },
      { label: 'Embeddings', geo: 'hexagon', role: 'accent' },
      { label: 'State Kernel', geo: 'hexagon', role: 'primary' },
      { label: 'Canvas Scene', geo: 'oval', role: 'accent' },
    ],
  },
  {
    id: 'orbit_system',
    title: 'Solar system, atomic orbitals, or ecosystem core with orbiting satellites',
    exemplars:
      'solar system planets orbiting sun, atomic nucleus with electrons, planetary orbit diagram, central sun with satellites revolving, ecosystem gravity model',
    defaultNodes: [
      { label: 'Sun', geo: 'ellipse', role: 'accent' },
      { label: 'Mercury', geo: 'ellipse', role: 'muted' },
      { label: 'Venus', geo: 'ellipse', role: 'secondary' },
      { label: 'Earth', geo: 'ellipse', role: 'primary' },
      { label: 'Mars', geo: 'ellipse', role: 'accent' },
    ],
  },
  {
    id: 'wireframe',
    title: 'Mobile or web app UI screen wireframe with navigation, hero, inputs, and CTA button',
    exemplars:
      'mobile app wireframe, login screen mockup, landing page ui wireframe, phone interface sketch, product screen layout',
    defaultNodes: [
      { label: 'Navigation Bar', geo: 'rectangle', role: 'muted' },
      { label: 'Hero Showcase', geo: 'rectangle', role: 'primary' },
      { label: 'Primary Input', geo: 'oval', role: 'secondary' },
      { label: 'Continue', geo: 'oval', role: 'accent' },
    ],
  },
  {
    id: 'state_machine',
    title: 'Finite state machine diagram with states and transition arrows',
    exemplars:
      'state machine diagram, finite automata states, idle loading active error transitions, connection lifecycle state graph',
    defaultNodes: [
      { label: 'Idle', geo: 'oval', role: 'muted' },
      { label: 'Arming', geo: 'hexagon', role: 'secondary' },
      { label: 'Live Stream', geo: 'oval', role: 'accent' },
      { label: 'Commit', geo: 'rectangle', role: 'primary' },
    ],
  },
  {
    id: 'layers',
    title: 'Horizontal stacked architecture layers or tech stack Cake diagram',
    exemplars:
      'layered stack diagram, horizontal platform tiers, osi model layers, frontend api data infrastructure stack, tech stack layers',
    defaultNodes: [
      { label: 'Presentation & Canvas Surface', geo: 'rectangle', role: 'accent' },
      { label: 'Semantic Intent & Design Bank', geo: 'rectangle', role: 'primary' },
      { label: 'Symbolic Register State Kernel', geo: 'rectangle', role: 'secondary' },
      { label: 'Streaming ONNX Runtime', geo: 'rectangle', role: 'muted' },
    ],
  },
  {
    id: 'comparison',
    title: 'Side-by-side comparison table, pros and cons, or before vs after columns',
    exemplars:
      'pros and cons comparison, side by side versus chart, option a vs option b, before and after comparison, tradeoffs chart',
    defaultNodes: [
      { label: 'Traditional UI', geo: 'rectangle', role: 'muted' },
      { label: 'Spoken Studio', geo: 'rectangle', role: 'accent' },
      { label: 'Nested Menus & Toolbars', geo: 'rectangle', role: 'muted' },
      { label: 'Zero Buttons · Direct Voice', geo: 'rectangle', role: 'primary' },
      { label: 'Manual Pixel Alignment', geo: 'rectangle', role: 'muted' },
      { label: 'Instant Curatorial Harmony', geo: 'rectangle', role: 'secondary' },
    ],
  },
  {
    id: 'sequence',
    title: 'UML sequence diagram with actor headers, vertical lifelines, and request/response message arrows',
    exemplars:
      'sequence diagram, uml sequence, request response call sequence, api interaction sequence with lifelines, client server database message flow',
    defaultNodes: [
      { label: 'Client App', geo: 'oval', role: 'secondary' },
      { label: 'Edge Gateway', geo: 'rectangle', role: 'primary' },
      { label: 'Auth Service', geo: 'hexagon', role: 'accent' },
      { label: 'Primary DB', geo: 'trapezoid', role: 'muted' },
    ],
  },
  {
    id: 'table',
    title: 'Structured multi-row multi-column data table, spreadsheet grid, or pricing matrix',
    exemplars:
      'draw a table, three by three table, data table grid, pricing tiers table, feature matrix spreadsheet, structured rows and columns table',
    defaultNodes: [
      { label: 'Layer', geo: 'rectangle', role: 'accent' },
      { label: 'Model', geo: 'rectangle', role: 'accent' },
      { label: 'Latency', geo: 'rectangle', role: 'accent' },
      { label: 'Speech', geo: 'rectangle', role: 'primary' },
      { label: 'Earlybird 29M', geo: 'rectangle', role: 'secondary' },
      { label: '80 ms', geo: 'rectangle', role: 'muted' },
      { label: 'Design', geo: 'rectangle', role: 'primary' },
      { label: 'Gemma 2 MRL', geo: 'rectangle', role: 'secondary' },
      { label: '12 ms', geo: 'rectangle', role: 'muted' },
    ],
  },
  {
    id: 'journey',
    title: 'User journey map or customer experience stages with touchpoints and sentiment notes',
    exemplars:
      'user journey map, customer journey stages, experience map with touchpoints and emotions, service blueprint journey',
    defaultNodes: [
      { label: '1 · Discover', geo: 'arrow-right', role: 'secondary' },
      { label: '2 · Speak', geo: 'arrow-right', role: 'primary' },
      { label: '3 · Refine', geo: 'arrow-right', role: 'primary' },
      { label: '4 · Export', geo: 'arrow-right', role: 'accent' },
    ],
  },
  {
    id: 'er_schema',
    title: 'Database entity-relationship ER schema diagram with table field cards and foreign-key connectors',
    exemplars:
      'database schema diagram, entity relationship diagram, er diagram, sql tables and foreign keys, data model schema',
    defaultNodes: [
      { label: 'users', geo: 'rectangle', role: 'primary' },
      { label: 'projects', geo: 'rectangle', role: 'accent' },
      { label: 'pages', geo: 'rectangle', role: 'secondary' },
      { label: 'assets', geo: 'rectangle', role: 'muted' },
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

export const TOPIC_CONCEPT_LEXICON: Record<string, string[]> = {
  solar: ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars'],
  planet: ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars'],
  atom: ['Nucleus', 'Inner Shell', 'Valence Electron', 'Photon'],
  space: ['Space Exploration', 'Orbital Launch', 'Lunar Gateway', 'Mars Habitat', 'Deep Space'],
  climate: ['Climate Tech', 'Solar Array', 'Grid Storage', 'Direct Capture', 'Clean Hydrogen'],
  photosynthesis: ['Sunlight', 'Chloroplast', 'Water & CO2', 'Glucose & Oxygen'],
  water: ['Evaporation', 'Condensation', 'Precipitation', 'Collection'],
  coffee: ['Whole Beans', 'Precision Grind', '9-Bar Extraction', 'Microfoam Latte'],
  checkout: ['Cart Review', 'Shipping Address', 'Payment Auth', 'Order Confirmed'],
  ecommerce: ['Storefront', 'Cart & Checkout', 'Stripe Payment', 'Fulfillment'],
  auth: ['User Credentials', 'OAuth Verify', 'Issue JWT', 'Protected Session'],
  login: ['Login Screen', 'Validate Token', '2FA Check', 'Dashboard'],
  rag: ['User Query', 'Vector Embed', 'Top-K Retrieval', 'Grounded Synthesis'],
  kubernetes: ['Ingress Load Balancer', 'Control Plane', 'Worker Pods', 'Persistent Volume'],
  startup: ['Core Problem', 'MVP Product', 'Design Partners', 'Growth Flywheel', 'Scale'],
  marketing: ['Awareness', 'Consideration', 'Trial Signup', 'Paid Conversion'],
  compiler: ['Source Code', 'Lexer & AST', 'IR Optimizer', 'Machine Code'],
  git: ['Working Tree', 'Stage Changes', 'Feature Commit', 'Pull Request', 'Production'],
  music: ['Harmony', 'Rhythm', 'Melody', 'Timbre', 'Arrangement'],
  game: ['Player Input', 'Physics Step', 'World State', '60fps Render'],
  science: ['Hypothesis', 'Experiment', 'Observation', 'Analysis', 'Conclusion'],
  biology: ['Cell Nucleus', 'Mitochondria', 'Ribosome', 'Cell Membrane', 'ATP Energy'],
  morning: ['Wake Early', 'Hydrate', 'Deep Focus', 'Movement'],
};

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
    title: 'Circle, orb, sphere, dot, hub, planet, or round node',
    exemplars: 'circle, round orb, sphere, bubble, point, hub, node, planet, sun, moon',
  },
  {
    id: 'arch-pill',
    shapeType: 'geo',
    geo: 'oval',
    w: 190,
    h: 82,
    role: 'secondary',
    title: 'Pill, badge, terminal start/end capsule, button, or tag',
    exemplars: 'pill, capsule, oval, rounded badge, button, start node, endpoint, user actor, client',
  },
  {
    id: 'arch-diamond',
    shapeType: 'geo',
    geo: 'diamond',
    w: 165,
    h: 150,
    role: 'accent',
    title: 'Diamond, decision gate, router, branch, or condition',
    exemplars: 'diamond, decision node, condition check, gateway branch, router, if else',
  },
  {
    id: 'arch-hexagon',
    shapeType: 'geo',
    geo: 'hexagon',
    w: 175,
    h: 140,
    role: 'primary',
    title: 'Hexagon, engine, processor, microservice, or worker',
    exemplars: 'hexagon, polygon, processor, worker, model engine, transformer, api gateway, microservice',
  },
  {
    id: 'arch-database',
    shapeType: 'geo',
    geo: 'trapezoid',
    w: 185,
    h: 115,
    role: 'muted',
    title: 'Database, storage bucket, warehouse, funnel stage, or index',
    exemplars: 'database, storage, sql postgres, vector store, bucket, cache, memory bank, trapezoid',
  },
  {
    id: 'arch-cloud',
    shapeType: 'geo',
    geo: 'cloud',
    w: 210,
    h: 130,
    role: 'secondary',
    title: 'Cloud, internet, external network, or thought cloud',
    exemplars: 'cloud, network, internet, external service, thought bubble, sky, cdn',
  },
  {
    id: 'arch-triangle',
    shapeType: 'geo',
    geo: 'triangle',
    w: 150,
    h: 140,
    role: 'accent',
    title: 'Triangle, pyramid, delta, warning, or hierarchy peak',
    exemplars: 'triangle, pyramid, warning alert, delta, hierarchy peak, wedge',
  },
  {
    id: 'arch-star',
    shapeType: 'geo',
    geo: 'star',
    w: 145,
    h: 145,
    role: 'accent',
    title: 'Star, spark, highlight, north star, or milestone emblem',
    exemplars: 'star, sparkle, milestone badge, north star, highlight emblem, award',
  },
  {
    id: 'arch-heart',
    shapeType: 'geo',
    geo: 'heart',
    w: 135,
    h: 130,
    role: 'accent',
    title: 'Heart, love, health, empathy, or favorite symbol',
    exemplars: 'heart, love, favorite, care, health, pulse',
  },
  {
    id: 'arch-octagon',
    shapeType: 'geo',
    geo: 'octagon',
    w: 155,
    h: 155,
    role: 'accent',
    title: 'Octagon, stop gate, security firewall, checkpoint, or pod',
    exemplars: 'octagon, eight sided stop sign, firewall security gate, guardrail, checkpoint',
  },
  {
    id: 'arch-pentagon',
    shapeType: 'geo',
    geo: 'pentagon',
    w: 155,
    h: 150,
    role: 'secondary',
    title: 'Pentagon, shield, crest, emblem, or five-sided node',
    exemplars: 'pentagon, five sided shield, badge crest, house shape, cluster',
  },
  {
    id: 'arch-rhombus',
    shapeType: 'geo',
    geo: 'rhombus',
    w: 195,
    h: 105,
    role: 'secondary',
    title: 'Parallelogram, rhombus, data input output stream, queue, or slanted card',
    exemplars: 'parallelogram, slanted box, data input output, io stream, message queue, buffer',
  },
  {
    id: 'arch-chevron',
    shapeType: 'geo',
    geo: 'arrow-right',
    w: 205,
    h: 95,
    role: 'accent',
    title: 'Right block arrow, phase chevron, callout banner, or forward pointer',
    exemplars: 'block arrow right, chevron banner, forward stage arrow, callout pointer',
  },
  {
    id: 'arch-chevron-left',
    shapeType: 'geo',
    geo: 'arrow-left',
    w: 205,
    h: 95,
    role: 'secondary',
    title: 'Left block arrow, return chevron, or backward pointer',
    exemplars: 'block arrow left, left chevron, return arrow shape, backward pointer',
  },
  {
    id: 'arch-checkbox',
    shapeType: 'geo',
    geo: 'check-box',
    w: 190,
    h: 90,
    role: 'secondary',
    title: 'Checkbox, completed task, checklist item, or verified requirement',
    exemplars: 'checkbox, check box, todo task item, verified check, done card, requirement',
  },
  {
    id: 'arch-xbox',
    shapeType: 'geo',
    geo: 'x-box',
    w: 190,
    h: 90,
    role: 'accent',
    title: 'Crossed X-box, blocker, anti-pattern, risk, or rejected option',
    exemplars: 'x box, crossed box, blocker card, anti pattern, rejected item, error state',
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
    title: 'Typography, title, heading, quote, caption, or standalone text',
    exemplars: 'heading, title text, standalone quote, typography, caption, write words, banner text',
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

export interface CritiquePrototype {
  id: 'balanced-hierarchy' | 'needs-accent-contrast' | 'dense-cluster' | 'sparse-minimal';
  title: string;
  description: string;
  exemplars: string;
}

export const CRITIQUE_PROTOTYPES: CritiquePrototype[] = [
  {
    id: 'balanced-hierarchy',
    title: 'Balanced Visual Hierarchy',
    description: 'Proportioned studio composition with clear primary, secondary, and accent rhythm.',
    exemplars:
      'balanced visual hierarchy, clear primary secondary accent contrast, generous museum whitespace, well proportioned architectural diagram',
  },
  {
    id: 'needs-accent-contrast',
    title: 'Applied Curatorial Contrast',
    description: 'Infused semantic palette differentiation and archival frame harmony across uniform forms.',
    exemplars:
      'uniform monochrome nodes needing semantic color contrast, flat unstyled boxes needing rich curatorial palette hierarchy',
  },
  {
    id: 'dense-cluster',
    title: 'Untangled Dense Cluster',
    description: 'Resolved spatial collisions into a breathing gallery grid with harmonized connectors.',
    exemplars:
      'crowded overlapping shapes, dense node cluster needing clean alignment, tangled layout needing breathing room and grid spacing',
  },
  {
    id: 'sparse-minimal',
    title: 'Framed Minimalist Study',
    description: 'Centered focal study with archival typography and poised gallery framing.',
    exemplars:
      'minimalist open canvas with one or two focal elements, sparse poetic study suited for bold framing and calm space',
  },
];
