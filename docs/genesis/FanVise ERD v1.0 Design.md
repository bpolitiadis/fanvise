### **1\. The Strategy: Relational Core \+ Intelligence Layer**

The architecture is split into two zones: the **Operational Zone** (PostgreSQL) for league mechanics and the **Cognitive Zone** (pgvector) for AI-driven insights.

### ---

**2\. FanVise Entity Relationship Diagram (v1.0)**

Code snippet

erDiagram  
    %% Core Identity & Access  
    USER ||--o{ LEAGUE\_MEMBERSHIP : joins  
    USER {  
        uuid id PK "Internal Auth ID"  
        string email "Unique Identifier"  
        string preferred\_language "Default: EN (Supports GR)"  
        string theme\_preference "Light/Dark Toggle"  
    }

    %% League & Rules Engine  
    LEAGUE ||--o{ LEAGUE\_MEMBERSHIP : enrolls  
    LEAGUE ||--o{ TEAM : contains  
    LEAGUE ||--o{ MATCHUP : schedules  
    LEAGUE {  
        string espn\_id PK "External ESPN API ID"  
        string season\_id "e.g., 2024"  
        jsonb scoring\_settings "PTS, REB, AST weights"  
        jsonb roster\_slots "PG, SG, SF, PF, C, G, F, UTIL"  
        timestamp last\_sync "Data freshness check"  
    }

    %% The Perspective Engine Anchor  
    TEAM ||--o{ PLAYER\_ROSTER : "current\_roster"  
    TEAM {  
        string team\_id PK "Internal unique ID"  
        string espn\_team\_id "External ESPN Team ID"  
        string espn\_league\_id FK "References League"  
        string manager\_name "Display Name"  
        boolean is\_user\_owned "Identifies 'My Team'"  
    }

    %% Player & Performance Layer  
    PLAYER ||--o{ PLAYER\_ROSTER : assigned\_to  
    PLAYER ||--o{ STAT\_AGGREGATE : performs  
    PLAYER ||--o{ NEWS\_INTELLIGENCE : triggers  
    PLAYER {  
        int espn\_player\_id PK "Primary Key"  
        string full\_name "Canonical Name"  
        string nba\_team "Current Team"  
        string position "Primary/Secondary positions"  
        boolean is\_injured "Global Injury Flag"  
        string injury\_status "Out, DTD, GTD"  
    }

    %% Strategic Insights (Calculated)  
    STAT\_AGGREGATE {  
        int player\_id FK  
        string timespan "Season, Last\_7, Last\_15"  
        float avg\_points "H2H Points based on League scoring"  
        int games\_played "Volume metric"  
        int games\_remaining\_week "Volume advantage tracker"  
    }

    %% Cognitive Layer (RAG)  
    NEWS\_INTELLIGENCE {  
        uuid id PK  
        int player\_id FK "Entity extraction link"  
        text raw\_content "Full text from RSS/Twitter"  
        string sentiment "Positive/Negative Impact"  
        vector embedding "1536-dim vector for Gemini RAG"  
        timestamp created\_at "Standard TTL monitoring"  
    }

### ---

**3\. Intentional Design Choices & Implementation Logic**

* **The Perspective Engine (Global State Management):** By linking USER to multiple LEAGUE\_MEMBERSHIP entries, the application can instantly reload all widgets (Roster Map, Optimization Engine) based on the active team\_id.

* **JSONB for Scoring Settings:** Since every ESPN league has slightly different scoring values (e.g., 1.2 vs 1.5 for a rebound), we store these as a JSONB object in the LEAGUE table. This allows the AI to pull the specific weights into the prompt context for hyper-accurate trade and drop analysis.  
  \+2

* **Decoupled Stat Aggregates:** We avoid the "Time Poverty" pain point by pre-calculating "Value Density" in the STAT\_AGGREGATE table. Instead of calculating averages on the fly, the AI queries this table to find "Pure Streams" vs. "Speculative Holds" in under 3 seconds.  
  \+3

* **Vector Integration (The Cognitive Layer):** The NEWS\_INTELLIGENCE table is our "Savant" brain. By using pgvector, we can perform a similarity search to find the latest injury reports for "Giannis" and immediately trigger the "Next Man Up" alert for "Bobby Portis".