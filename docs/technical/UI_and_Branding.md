# UI Design & Branding

FanVise adopts a "Street-Smart High-Tech" aesthetic, blending modern data density with basketball culture.

## Design System

- **Styling**: Tailwind CSS v4 (using the `@theme` directive for consolidated variables).
- **Components**: Based on **shadcn/ui** for accessibility and consistency.
- **Icons**: Lucide React.
- **Typography**: **Geist Sans** (Headings/UI) and **Geist Mono** (Stat tables).

### Color Palette ("Fresh Hops")

| Role | Color Name | Hex Code | Usage |
| :--- | :--- | :--- | :--- |
| Primary | **Future Teal** | `#0d9488` | The AI voice, primary buttons, "thinking" states. |
| Accent | **Rim Orange** | `#ea580c` | Alerts, hot players, critical CTAs. |
| Background | **Court White** | `#fdfbf7` | Subtle warm off-white (Light Mode). |
| Background | **Midnight** | `hsl(222 47% 11%)` | Sleek slate/blue (Dark Mode). |

## Key UI Components

### 1. Perspective Sidebar (`src/components/chat/sidebar.tsx`)
A persistent navigation and context hub. 
- **Team Switcher**: Allows the user to instantly toggle between their team and any other team in the league (Opponent View).
- **Intel History**: Quick access to past strategic inquiries.

### 2. Intelligence Dashboard (`src/app/page.tsx`)
A "single-pane-of-glass" view for quick decisions.
- **Volume Advantage (Heatmap)**: Visualizes games remaining for the week.
- **Intelligence Feed**: Direct feed of high-impact injury news.
- **Efficiency Audit**: Quick stats on player performance relative to league scoring.

### 3. Chat Interface (`src/components/chat/chat-interface.tsx`)
A fluid, streaming interface for deep strategic analysis. Includes support for "Intelligent Widgets" like Player Cards and Stat Grids within the message stream.
