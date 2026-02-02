# **FanVise: Brand Identity & UI/UX Strategic Masterplan (v1.0)**

## **1\. Executive Summary**

**FanVise** is the "Intelligent Edge" for Fantasy Basketball. It is not a betting site, nor is it a dry spreadsheet tool. It is a high-tech companion that combines deep data analytics with the culture of basketball.

* **The Vibe:** Fresh, energetic, "Street-Smart High-Tech." Think *The Athletic* meets *Arc Browser*, infused with NBA court culture.  
* **The Core Experience:** A "Savant Co-Owner" (AI) guiding the user through a familiar, standard Chat interface.  
* **The Tech Philosophy:** "Don't Reinvent the Wheel." We leverage **Next.js** and **shadcn/ui** to build a system that feels fluid, instant, and native.  
* **Localization:** Native support for **English** and **Greek** from Day 1\.

## ---

**2\. Brand Design System**

### **2.1 Visual Metaphor: "The Digital Courtside"**

We are moving away from dark, heavy financial aesthetics. The new look is **Airy, Crisp, and Kinetic.**

* **Light Mode (Default):** The primary view. Clean white/off-white backgrounds, heavily relying on whitespace to reduce cognitive load. It feels optimistic and clear.  
* **Dark Mode:** A toggle option. It shifts to a sleeker, "Night Game" vibe—cool greys and deep teals—retaining the high-tech feel without becoming a gloomy terminal.  
* **Accent Philosophy:** Color is used with extreme intention.  
  * **Teal:** Represents **Intelligence** (The AI, The Data, The Future).  
  * **Orange:** Represents **The Game** (The Ball, The Action, The Court).

### **2.2 Typography**

We utilize the **Geist** family (Vercel's standard). It is modern, incredibly legible, and "invisible"—allowing the content to shine.

| Context | Font Family | Rationale |
| :---- | :---- | :---- |
| **Headings & UI** | **Geist Sans** | Clean, geometric, and modern. Supports multiple weights for hierarchy. |
| **Data & Stats** | **Geist Mono** | Essential for tabular data (Points, Rebounds, Assists) to ensure perfect vertical alignment. |
| **Language Support** | **N/A** | Geist natively supports Greek glyphs, ensuring visual consistency across translations. |

### **2.3 Color Theory: "Fresh Hops"**

This palette avoids generic "Bootstrap" colors. It pairs a hyper-modern Teal with a classic Basketball Orange.

#### **The Palette**

| Role | Color Name | Hex Code | Usage |
| :---- | :---- | :---- | :---- |
| **Background** | Court White | \#fdfbf7 | A very subtle warm off-white (Light Mode). Avoids clinical pure white. |
| **Surface** | Paper White | \#ffffff | Cards, Inputs, Sidebars (Light Mode). |
| **Primary Brand** | Future Teal | \#0d9488 | **The AI Voice.** Submit buttons, "Thinking" states, primary navigation. |
| **Accent / Action** | Rim Orange | \#ea580c | **The Game.** Alerts, "Hot" players, Buy signals, Critical CTAs. |
| **Text (Main)** | Ink Black | \#1e293b | Primary text. High contrast, readable. |
| **Text (Muted)** | Court Grey | \#64748b | Labels, timestamps, metadata. |
| **Success** | Mint | \#10b981 | Positive Stat Variance. |
| **Error / Alert** | Foul Red | \#ef4444 | Injuries, negative trade value. |

*(Note: Dark Mode maps these to deep Slate tones, keeping the Teal/Orange accents luminous).*

## ---

**3\. The UI/UX Strategy: "Standardized Flow"**

**Core Principle:** Adhere to **Jakob’s Law**. Users spend most of their time on other sites. We will use the standard LLM (Large Language Model) layout pattern (ChatGPT/Claude) because users already know how to use it.

### **3.1 Framework: shadcn/ui**

We strictly use **shadcn/ui** components.

* **Why:** Accessibility, keyboard navigation, and production speed.  
* **Rule:** If a component exists in the Shadcn registry (e.g., Select, Dialog, Sheet, Table), use it. Do not custom build unless absolutely necessary.

### **3.2 Layout Architecture**

1. **The Sidebar (Navigation):**  
   * **Tech:** shadcn/sheet (mobile) / Resizable Panel (desktop).  
   * **Content:** "New Chat" button (Teal), Chat History (grouped by week), User Profile, and **Settings (Language Toggle)**.  
2. **The Chat Stream (Central):**  
   * **Behavior:** A single, smooth-scrolling feed.  
   * **User Message:** Simple text bubble, right-aligned or distinct background.  
   * **FanVise (AI) Message:** Left-aligned. Clean text mixed with **"Intelligent Widgets"** (Tables, Cards).  
3. **The Input Dock (Floating):**  
   * **Tech:** shadcn/textarea \+ Button.  
   * **Context Pills:** Small badges above the input box showing current status (e.g., *"Viewing League: Espn-Pro-1"*).

### **3.3 "Intelligent Widgets" (RAG Outputs)**

The AI doesn't just output text; it renders components within the chat stream.

* **The "Player Card":** When discussing a player, render a compact card with their photo, next 3 opponents, and a "Health" badge.  
* **The "Stat Grid":** A shadcn/table with sticky headers showing comparison stats.  
* **The "Verdict" Badge:** A visual component at the top of a trade analysis summarizing the advice (e.g., a Green Thumbs Up or Red Warning).

## ---

**4\. Localization (i18n) Strategy**

**Requirement:** The app is bilingual (English/Greek) from MVP.

1. **UI Labels:** All static text (Buttons, Settings, Sidebar) is mapped via translation keys (e.g., t('ui.new\_chat')).  
2. **AI Output:** The RAG pipeline detects the user's language setting.  
   * **System Prompt Injection:** \* "The user's locale is {LOCALE}. Respond in that language. If the locale is Greek, keep specific NBA terminology (Pick & Roll, Box Score, Waiver Wire) in English for clarity, but conduct the analysis in Greek."\*

## ---

**5\. Voice & Tone: "The Savant Co-Owner"**

**Persona:** Imagine your college roommate who is a data genius, watches every game, and helps run the team with you. He’s hype, he’s smart, and he’s "one of us."

* **Traits:** High-Tech, Supportive, Knowledgeable, Cultured.  
* **Avoid:** Robot speak ("I have calculated..."), Cynicism, Dry Financial Jargon.

### **5.1 Voice Examples**

| Context | Generic AI (Avoid) | The FanVise Savant (Target) |
| :---- | :---- | :---- |
| **Winning a Trade** | "This trade has a positive ROI of 12%." | "Bro, you are robbing them. You gain \+12% value instantly. Smash accept before they sober up." |
| **Injury News** | "Embiid is injured. Adjust lineup." | "Tough blow, Embiid is out. But we've got options. Paul Reed is sitting on the wire and his per-36 stats are elite. Let's pivot." |
| **Draft Advice** | "Select Haliburton. High assist rate." | "Haliburton is the play here. He is the engine of that offense and fits our 'Punt Rebounds' build perfectly. Lock him in." |

## ---

**6\. Pre-Code Asset Checklist**

### **6.1 Libraries to Install**

* pnpm dlx shadcn@latest init (Select "Slate" as base, but we will override colors).  
* pnpm install lucide-react (Standard Icons).  
* pnpm install next-intl (Localization).  
* pnpm install framer-motion (For smooth "streaming" text effects).

### **6.2 Asset Preparation**

* **Icons (Lucide):**  
  * Sparkles (The AI/Teal).  
  * Flame (Hot/Orange).  
  * Dribbble (Basketball/Sport Context).  
  * Globe (Language Toggle).  
* **Translation Files:** Initialize messages/en.json and messages/gr.json.

## ---

**7\. Tailwind Configuration (globals.css)**

We utilize **Tailwind CSS v4**, which removes the need for `tailwind.config.ts`. All variables are defined directly in CSS using the `@theme` directive.

```css
@import "tailwindcss";

@theme {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));

  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));

  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));

  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));

  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));

  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));

  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));

  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}
```  
