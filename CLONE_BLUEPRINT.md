# MASTER SYSTEM BLUEPRINT: ENTERPRISE POS & HIERARCHICAL INVENTORY SYSTEM

> **Client:** `[INSERT_CLIENT_NAME]`  
> **Target Industry / Domain:** `[INSERT_INDUSTRY]`  
> **Source Archetype:** Multi-Tier Point of Sale, Adjacency-List Inventory Engine & Financial Accounting System  
> **Architecture Pattern:** Zero-Trust Client-Serverless Hybrid with Resilient Edge Offline Fallback (PWA + IndexedDB + SQLite)  

---

## HOW TO USE THIS BLUEPRINT

This blueprint is an end-to-end master technical specification and AI implementation guide. It contains the exact architectural patterns, mathematical formulas, stored procedures, database triggers, offline sync protocols, and frontend workflows extracted from production.

To clone and deploy a new instance of this system for `[INSERT_CLIENT_NAME]` in the `[INSERT_INDUSTRY]` sector:
1. Provide **Section 1** as the context and technology boundary to your development team or AI agent.
2. Execute **Section 2 (Phase 1 Database Prompt)** to instantiate the PostgreSQL / Supabase schema, recursive PL/pgSQL procedures, triggers, and SQLite fallback schemas.
3. Execute **Section 3 (Phase 2 Backend & Routing Prompt)** to scaffold the edge routing, service worker caching, IndexedDB transaction queue, and role-based access control.
4. Execute **Section 4 (Phase 3 Frontend & UI Prompt)** to build the multi-page POS interface, the dynamic quick-add engine, receipt PDF renderer, and the **Single-Screen Packaging Wizard**.

---

## 1. System Architecture & Tech Stack

### 1.1 Core Technology Inventory

| Layer | Technology | Version / Specification | Rationale & Responsibility |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | Vanilla ES6+ Modules | Modern ECMAScript (Modules `type="module"`) | Zero-build fast boot, high performance on low-spec POS terminals, zero bundler overhead. *(Can be ported to Vite + React/Vue/Svelte without logic changes).* |
| **CSS & Design System** | Tailwind CSS | v3.x (CDN / PostCSS build) | Utility-first styling, rapid responsive layout customization, dark/light contrast optimized for POS touch displays. |
| **Primary Cloud Database** | PostgreSQL via Supabase | PostgreSQL 15+ | Relational integrity, native UUID v4 surrogate keys, Row-Level Security (RLS), Realtime WebSocket channels, and PL/pgSQL atomic procedures. |
| **Client-Side DB SDK** | `@supabase/supabase-js` | v2.39.0+ | Direct asynchronous data mutations from edge clients with auto-reconnect and change subscriptions. |
| **Offline Transaction Store** | Browser IndexedDB | `IndexedDB API` (DB: `essie-offline`, v1) | Stores uncommitted sales (`pending_sales`) and operating expenses (`pending_expenses`) when network connection is severed. |
| **Client Cache Layer** | Browser `localStorage` | HTML5 Web Storage API | Instant offline boot; caches user authentication sessions, catalog snapshots, debt ledgers, and terminal settings. |
| **Offline Shell & PWA** | Service Worker API | Cache-on-Navigate + Stale-While-Revalidate | Intercepts HTTP GET requests, pre-caches offline fallback UI (`offline.html`), serves cached static assets, and bypasses live cloud REST endpoints. |
| **Local Desktop Engine** | SQLite3 via Node.js | `sqlite3` v6.0.1+ / Express v5 | Standalone desktop fallback backend; maintains local POS operational parity (`pos.db`) with sync metadata (`is_synced`, `remote_id`, `sync_source`). |
| **Web Server** | Node.js + Express | Express v5.x / v4.x | Static asset hosting, fallback SPA/MPA navigation routing, and local printer/hardware bridge. |
| **Document Engine** | jsPDF + AutoTable | `jspdf` v2.5.1 + `jspdf-autotable` v3.5.31 | Client-side 80mm thermal receipt and formal A4 quotation PDF rendering with automatic page breaks and corporate branding. |
| **Spreadsheet Engine** | SheetJS (`xlsx`) | `xlsx` v0.18.5 | Client-side tabular inventory export with column width autocalculation and formatted pricing metrics. |

### 1.2 Architectural Data Flow & Topography

```
                    +--------------------------------------------+
                    |            Client Edge Terminal            |
                    |  (Desktop Browser, Tablet, or Touch PWA)   |
                    +---------------------+----------------------+
                                          |
                        +-----------------+-----------------+
                        |                                   |
                  [ONLINE MODE]                      [OFFLINE MODE]
                        |                                   |
                        v                                   v
             +--------------------+               +--------------------+
             | Supabase Client    |               | IndexedDB Queue    |
             | (REST / Realtime)  |               | ('pending_sales',  |
             +----------+---------+               |  'pending_expenses'|
                        |                         +---------+----------+
                        v                                   |
             +--------------------+                         |
             |  Supabase Postgres |                         | (On Reconnect)
             |  - UUID Keys       |<------------------------+
             |  - RLS Policies    |     Sequential Draining
             |  - Waterfall Stored|
             |    Procedure       |
             |  - Sync Triggers   |
             +--------------------+
                        ^
                        | (Optional Periodic Replication)
                        v
             +--------------------+
             | Node.js + Express  |
             | + SQLite3 Fallback |
             +--------------------+
```

---

## 2. Phase 1 Database Prompt: Schema, Hierarchical Waterfall, & Triggers

Copy and paste the prompt below into an AI agent to generate the complete database layer.

````markdown
# TASK: Recreate the Complete Database Layer for `[INSERT_CLIENT_NAME]` (`[INSERT_INDUSTRY]`)

You are a Principal Database Architect & DevSecOps Engineer. You must generate the complete, production-ready database schema for a Point of Sale and Inventory Management System using PostgreSQL 15+ (Supabase compatible) along with an equivalent local SQLite3 schema.

### Core Architectural Requirements:
1. **Surrogate Key (UUID) Strategy:**
   - Every primary key in the cloud schema MUST be a UUID v4 generated via `gen_random_uuid()`.
   - Never use auto-incrementing sequential integers for primary keys in the cloud database. UUIDs allow distributed client devices and offline POS terminals to create records independently without primary key collisions upon syncing.
2. **Hierarchical Inventory Adjacency List:**
   - Multi-tier packaging (e.g., Piece -> Pack -> Box -> Carton) MUST be modeled using an Adjacency List pattern on the `inventory` table.
   - Each row represents a sellable SKU with:
     - `parent_id UUID REFERENCES inventory(id) ON DELETE SET NULL`
     - `tier_level INTEGER DEFAULT 1 CHECK (tier_level >= 1)` (1 = Retail Base Unit, 2 = Inner Pack, 3 = Case/Box, 4 = Master Carton)
     - `units_per_parent INTEGER DEFAULT 1 CHECK (units_per_parent >= 1)` (Specifies how many units of the child SKU are produced when 1 unit of its parent SKU is unpacked).
3. **Atomic Recursive Inventory Deduction (`deduct_inventory_waterfall`):**
   - Provide the complete PL/pgSQL function to deduct stock with recursive auto-unpacking.
   - If stock for a requested item is insufficient, the system must automatically and recursively unpack the minimum required quantity of parent items down the hierarchy until the required child stock is satisfied.
   - Must implement cycle detection using a visited UUID array (`visited UUID[]`).
   - Must use pessimistic concurrency locking (`SELECT ... FOR UPDATE`) on every inspected row to eliminate race conditions under concurrent checkouts.
4. **Autonomous Stock Sync Triggers:**
   - Attach an `AFTER INSERT OR UPDATE OR DELETE` trigger on `sales_log` that automatically calls `deduct_inventory_waterfall` on sale creation, restores stock when a sale is voided (`is_voided = TRUE`), and re-deducts stock if unvoided.
5. **Role-Based Row-Level Security (RLS):**
   - Enable RLS on every table. Define explicit policies for standard POS client operations.

---

### Step 1: PostgreSQL DDL Script

```sql
-- Enable cryptographic extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ====================================================================
-- 1. USERS & ACCESS CONTROL
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    pin VARCHAR(8) NOT NULL, -- Hashed or 4-digit POS PIN
    role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'manager')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 2. INVENTORY & PACKAGING TIERS (Adjacency List Pattern)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('fixed', 'variable')),
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    buying_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    profit_margin NUMERIC(12, 2) GENERATED ALWAYS AS (selling_price - buying_price) STORED,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_threshold INTEGER NOT NULL DEFAULT 5,
    barcode VARCHAR(255) NULL,
    category TEXT DEFAULT 'Uncategorized',
    is_service BOOLEAN DEFAULT FALSE,
    is_kyocera BOOLEAN DEFAULT FALSE, -- Metered hardware / printer tracking
    is_quick_add BOOLEAN DEFAULT FALSE,
    -- Hierarchy & Packaging Tier Columns
    parent_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
    units_per_parent INTEGER NOT NULL DEFAULT 1 CHECK (units_per_parent >= 1),
    tier_level INTEGER NOT NULL DEFAULT 1 CHECK (tier_level >= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_parent_id ON public.inventory(parent_id);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON public.inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON public.inventory(name);

-- ====================================================================
-- 3. CUSTOMER LEDGER & DEBT TRACKING
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    outstanding_debt NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- ====================================================================
-- 4. SALES LOG & AUDIT LEDGER
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.sales_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.inventory(id) ON DELETE RESTRICT,
    total_charged NUMERIC(12, 2) NOT NULL,
    calculated_qty NUMERIC(12, 2) NOT NULL DEFAULT 1,
    calculated_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cashier_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'M-Pesa', 'Card', 'Debt')),
    tax_amount NUMERIC(12, 2) DEFAULT 0,
    buying_price_at_sale NUMERIC(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'debt', 'refunded', 'voided')),
    is_voided BOOLEAN DEFAULT FALSE,
    voided_at TIMESTAMP WITH TIME ZONE,
    voided_by UUID REFERENCES public.users(id),
    kyocera_pages INTEGER DEFAULT 0, -- Metered unit count
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_log_timestamp ON public.sales_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sales_log_item ON public.sales_log(item_id);
CREATE INDEX IF NOT EXISTS idx_sales_log_customer ON public.sales_log(customer_id);

-- ====================================================================
-- 5. RAW OPERATING RESOURCES & CONSUMABLES
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    units INTEGER NOT NULL DEFAULT 1,
    cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'archived')),
    opened_by UUID REFERENCES public.users(id),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    linked_inventory_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
    consumed_units INTEGER DEFAULT 0
);

-- ====================================================================
-- 6. ATTENDANCE & SHIFT WAGES
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.attendance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    work_date DATE NOT NULL,
    wage_assigned NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, work_date)
);

-- ====================================================================
-- 7. OVERHEAD EXPENSES & MONTHLY FINANCIAL CLOSES
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.overhead_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period TEXT NOT NULL UNIQUE, -- 'YYYY-MM'
    rent NUMERIC(12, 2) DEFAULT 0,
    electricity NUMERIC(12, 2) DEFAULT 0,
    wifi_internet NUMERIC(12, 2) DEFAULT 0,
    other_fixed NUMERIC(12, 2) DEFAULT 0,
    entered_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.monthly_closes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period TEXT NOT NULL UNIQUE, -- 'YYYY-MM'
    gross_revenue NUMERIC(12, 2) DEFAULT 0,
    cogs_resources NUMERIC(12, 2) DEFAULT 0,
    cogs_kyocera NUMERIC(12, 2) DEFAULT 0,
    total_overheads NUMERIC(12, 2) DEFAULT 0,
    total_maintenance NUMERIC(12, 2) DEFAULT 0,
    total_wages NUMERIC(12, 2) DEFAULT 0,
    net_profit NUMERIC(12, 2) DEFAULT 0,
    closed_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 8. SYSTEM CONFIGURATION & SETTINGS
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default initial configurations
INSERT INTO public.settings (key, value) VALUES
    ('tax_rate', '0'),
    ('currency_symbol', 'Ksh'),
    ('quick_add_order', '[]'),
    ('binding_groups', '[]'),
    ('binding_linked_resources', '[]'),
    ('binding_show_tape', 'false')
ON CONFLICT (key) DO NOTHING;

-- Seed default administrative and cashier users
INSERT INTO public.users (username, pin, role) VALUES 
    ('admin', '1234', 'admin'),
    ('cashier', '0000', 'cashier')
ON CONFLICT (username) DO NOTHING;
```

---

### Step 2: Atomic Recursive Waterfall Stored Procedure

```sql
-- ====================================================================
-- ATOMIC WATERFALL INVENTORY UNPACKING PROCEDURE
-- ====================================================================
CREATE OR REPLACE FUNCTION public.deduct_inventory_waterfall(
    target_item_id UUID,
    deduct_qty INTEGER,
    visited UUID[] DEFAULT '{}'
)
RETURNS BOOLEAN AS $$
DECLARE
    v_stock INTEGER;
    v_parent_id UUID;
    v_units_per_parent INTEGER;
    v_parents_needed INTEGER;
BEGIN
    -- 1. Cycle Detection Guard
    IF target_item_id = ANY(visited) THEN
        RAISE EXCEPTION 'Cyclic parent reference detected for inventory item %', target_item_id;
    END IF;

    -- 2. Acquire Row-Level Lock (Pessimistic concurrency control)
    SELECT stock_quantity, parent_id, units_per_parent 
    INTO v_stock, v_parent_id, v_units_per_parent
    FROM public.inventory 
    WHERE id = target_item_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory item % does not exist', target_item_id;
    END IF;

    -- 3. Base Case 1: Current SKU has sufficient stock
    IF v_stock >= deduct_qty THEN
        UPDATE public.inventory 
        SET stock_quantity = stock_quantity - deduct_qty,
            updated_at = NOW()
        WHERE id = target_item_id;
        RETURN TRUE;
    END IF;

    -- 4. Base Case 2: Insufficient stock, attempt recursive unpack from parent
    IF v_stock < deduct_qty AND v_parent_id IS NOT NULL AND v_units_per_parent > 0 THEN
        -- Calculate how many whole parent units must be opened
        v_parents_needed := CEIL((deduct_qty - v_stock)::NUMERIC / v_units_per_parent);
        
        -- Recurse up the parent hierarchy with cycle tracking
        IF public.deduct_inventory_waterfall(v_parent_id, v_parents_needed, visited || target_item_id) THEN
            -- Credit newly unpacked units to this item and subtract deduct_qty
            UPDATE public.inventory 
            SET stock_quantity = stock_quantity + (v_parents_needed * v_units_per_parent) - deduct_qty,
                updated_at = NOW()
            WHERE id = target_item_id;
            RETURN TRUE;
        END IF;
    END IF;

    -- 5. Failure Case: Insufficient stock and no viable parent package
    RAISE EXCEPTION 'Insufficient stock for item % and recursive auto-unpack failed', target_item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### Step 3: Automated Stock Synchronization Triggers

```sql
-- ====================================================================
-- SALES LOG STOCK SYNCHRONIZATION TRIGGER FUNCTION
-- ====================================================================
CREATE OR REPLACE FUNCTION public.sync_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- EVENT A: INSERT (New Sale Logged)
    IF TG_OP = 'INSERT' THEN
        IF NEW.item_id IS NOT NULL THEN
            -- Only deduct if item is physical (fixed non-service)
            IF EXISTS (
                SELECT 1 FROM public.inventory 
                WHERE id = NEW.item_id AND type = 'fixed' AND is_service = false
            ) THEN
                PERFORM public.deduct_inventory_waterfall(NEW.item_id, NEW.calculated_qty::INTEGER);
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- EVENT B: UPDATE (Voiding or Restoring a Sale)
    IF TG_OP = 'UPDATE' THEN
        -- Case 1: Sale is transitioned to VOIDED -> Restore Stock
        IF OLD.is_voided = FALSE AND NEW.is_voided = TRUE THEN
            IF NEW.item_id IS NOT NULL THEN
                UPDATE public.inventory
                SET stock_quantity = stock_quantity + NEW.calculated_qty,
                    updated_at = NOW()
                WHERE id = NEW.item_id 
                  AND type = 'fixed' 
                  AND is_service = false;
            END IF;
        END IF;

        -- Case 2: Sale is UN-VOIDED -> Re-deduct via Waterfall
        IF OLD.is_voided = TRUE AND NEW.is_voided = FALSE THEN
            IF NEW.item_id IS NOT NULL THEN
                IF EXISTS (
                    SELECT 1 FROM public.inventory 
                    WHERE id = NEW.item_id AND type = 'fixed' AND is_service = false
                ) THEN
                    PERFORM public.deduct_inventory_waterfall(NEW.item_id, NEW.calculated_qty::INTEGER);
                END IF;
            END IF;
        END IF;
        
        RETURN NEW;
    END IF;

    -- EVENT C: DELETE (Physical Record Removal)
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_voided = FALSE AND OLD.item_id IS NOT NULL THEN
            UPDATE public.inventory
            SET stock_quantity = stock_quantity + OLD.calculated_qty,
                updated_at = NOW()
            WHERE id = OLD.item_id 
              AND type = 'fixed' 
              AND is_service = false;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to sales_log
DROP TRIGGER IF EXISTS trg_sync_inventory_stock ON public.sales_log;
CREATE TRIGGER trg_sync_inventory_stock
AFTER INSERT OR UPDATE OR DELETE ON public.sales_log
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_stock();
```

---

### Step 4: Row-Level Security Policies

```sql
-- Enable RLS across all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overhead_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- For local network and authenticated POS terminals:
CREATE POLICY "Allow authenticated and anon access on users" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on inventory" ON public.inventory FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on customers" ON public.customers FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on sales_log" ON public.sales_log FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on resources" ON public.resources FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on attendance_log" ON public.attendance_log FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on overhead_entries" ON public.overhead_entries FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on expenses" ON public.expenses FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on monthly_closes" ON public.monthly_closes FOR ALL USING (true);
CREATE POLICY "Allow authenticated and anon access on settings" ON public.settings FOR ALL USING (true);
```

---

### Step 5: Equivalent SQLite3 Fallback Schema (`pos.db`)

When operating completely detached from cloud services or on a local server device, instantiate the following schema:

```sql
CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY, -- Store UUID as TEXT
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('fixed', 'variable')),
    selling_price REAL DEFAULT 0,
    buying_price REAL DEFAULT 0,
    profit_margin REAL DEFAULT 0,
    stock_quantity INTEGER DEFAULT 0,
    min_threshold INTEGER DEFAULT 5,
    barcode TEXT,
    category TEXT DEFAULT 'Uncategorized',
    is_service INTEGER DEFAULT 0,
    is_kyocera INTEGER DEFAULT 0,
    is_quick_add INTEGER DEFAULT 0,
    parent_id TEXT,
    units_per_parent INTEGER DEFAULT 1,
    tier_level INTEGER DEFAULT 1,
    is_synced INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES inventory(id)
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'manager')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    outstanding_debt REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_log (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    total_charged REAL NOT NULL,
    calculated_qty REAL NOT NULL,
    calculated_profit REAL NOT NULL,
    cashier_id TEXT,
    customer_id TEXT,
    payment_method TEXT DEFAULT 'Cash',
    tax_amount REAL DEFAULT 0,
    buying_price_at_sale REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    is_voided INTEGER DEFAULT 0,
    voided_at DATETIME,
    voided_by TEXT,
    kyocera_pages INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_synced INTEGER DEFAULT 0,
    remote_id TEXT,
    FOREIGN KEY (item_id) REFERENCES inventory(id),
    FOREIGN KEY (cashier_id) REFERENCES users(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```
````

---

## 3. Phase 2 Backend & Routing Prompt: Offline/Online Logic, Edge Routing & Auth

Copy and paste the prompt below into an AI agent to build the offline-resilient edge backend and routing foundation.

````markdown
# TASK: Implement Offline/Online Routing, IndexedDB Sync Queue, and Auth State Management for `[INSERT_CLIENT_NAME]` (`[INSERT_INDUSTRY]`)

You are a Senior Full-Stack Engineer. You must implement the edge client routing, Service Worker offline caching strategy, IndexedDB transaction queue, and local-first session authentication layer.

### Core Architectural Requirements:
1. **Multi-Page Static Server & Route Guarding:**
   - Implement `src/server.js` using Node.js and Express to serve static files from `/public`.
   - All standard navigation routes must serve their corresponding HTML views (`/pos.html`, `/inventory.html`, `/admin.html`, etc.), falling back gracefully to `/login.html` when unauthenticated.
2. **Service Worker Strategy (`public/sw.js`):**
   - Implement cache-first strategy for static assets (JavaScript, CSS, fonts, Tailwind CDN scripts).
   - Implement network-first strategy for page navigations with cache fallback, resolving to `/offline.html` if completely unreachable.
   - **Crucial Rule:** The Service Worker MUST EXPLICITLY BYPASS all Supabase REST/WebSocket traffic (`supabase.co`) and non-GET requests. Data persistence when offline is handled by IndexedDB, not Service Worker HTTP interception.
3. **IndexedDB Offline Transaction Queue (`public/js/offlineQueue.js`):**
   - Implement an IndexedDB database named `essie-offline` with object stores `pending_sales` and `pending_expenses`.
   - Provide `insertSaleWithOfflineSupport(supabase, payload)`: If `navigator.onLine` is false or the cloud write fails due to network outage, queue the mutation locally and return `{ offline: true }`.
   - Provide `syncOfflineSales(supabase)` and `syncOfflineExpenses(supabase)`: Reads pending transactions in chronological order, sequentially writes them into Supabase via the REST client, and removes the local IndexedDB record only upon successful remote acknowledgment.
   - Listen to `window.addEventListener('online')` to automatically flush the queue and refresh UI ledgers.
4. **Client-Side PIN Authentication & Role Guarding (`public/js/supabaseClient.js` & `login.js`):**
   - Cashiers and Admins authenticate via a 4-digit PIN against the `users` table.
   - Successful auth stores a session JSON object in `localStorage` (`essie_session`).
   - Every protected view calls `requireAuth()` at the top of execution.
   - Elements marked with `.admin-only` must remain hidden unless `currentUser.role === 'admin'`.
   - Implement an offline login fallback: Cache the user table in `localStorage` (`essie_users_cache`) so cashiers can unlock the POS terminal even during complete broadband outages.

---

### Implementation File 1: Node.js Express Web Server (`src/server.js`)

```javascript
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Root route redirects to login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Fallback navigation handler for HTML page requests
app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(__dirname, '../public/login.html'));
    } else {
        next();
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 [INSERT_CLIENT_NAME] POS SERVER STARTED`);
    console.log(`> Listening on: http://localhost:${PORT}`);
    console.log(`> Target Industry: [INSERT_INDUSTRY]`);
    console.log(`====================================================`);
});
```

---

### Implementation File 2: Service Worker Cache Engine (`public/sw.js`)

```javascript
const CACHE_NAME = 'client-pos-cache-v1';
const PRECACHE = ['/offline.html'];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // CRITICAL: Never intercept Supabase cloud API requests or mutations
    if (url.hostname.includes('supabase.co') || event.request.method !== 'GET') {
        return;
    }

    const isNavigation = event.request.mode === 'navigate';
    const isAsset = /\.(js|css|png|jpg|svg|ico|json|woff2?)$/i.test(url.pathname)
        || url.hostname.includes('cdn')
        || url.hostname.includes('jsdelivr')
        || url.hostname.includes('cdnjs');

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) =>
            cache.match(event.request).then((cachedResponse) => {
                const networkFetch = fetch(event.request).then((networkResponse) => {
                    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque') && (isNavigation || isAsset)) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                });

                if (isNavigation) {
                    // Network first; fallback to cache; ultimate fallback: offline.html
                    return networkFetch.catch(() => {
                        if (cachedResponse) return cachedResponse;
                        return caches.match('/offline.html');
                    });
                }

                // Cache first for assets; update cache in background
                if (cachedResponse) {
                    networkFetch.catch(() => {});
                    return cachedResponse;
                }

                return networkFetch.catch(() => new Response('', { status: 408 }));
            })
        )
    );
});
```

---

### Implementation File 3: IndexedDB Offline Queue Manager (`public/js/offlineQueue.js`)

```javascript
const DB_NAME = 'client_pos_offline';
const DB_VERSION = 1;
const STORE_SALES = 'pending_sales';
const STORE_EXPENSES = 'pending_expenses';

function openOfflineDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_SALES)) {
                db.createObjectStore(STORE_SALES, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
                db.createObjectStore(STORE_EXPENSES, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Queue sales during offline mode
async function queueOfflineSale(payload) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SALES, 'readwrite');
        tx.objectStore(STORE_SALES).add({ ...payload, queued_at: Date.now() });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function getPendingSales() {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SALES, 'readonly');
        const req = tx.objectStore(STORE_SALES).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function deletePendingSale(id) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SALES, 'readwrite');
        tx.objectStore(STORE_SALES).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

export async function insertSaleWithOfflineSupport(supabase, payload) {
    if (!navigator.onLine) {
        await queueOfflineSale(payload);
        return { offline: true };
    }
    try {
        const { data, error } = await supabase.from('sales_log').insert([payload]).select().single();
        if (error) throw error;
        return { data };
    } catch (err) {
        console.warn('Network write failed, enqueuing sale locally:', err.message);
        await queueOfflineSale(payload);
        return { offline: true };
    }
}

// Sequential queue drain upon network restoration
export async function syncOfflineSales(supabase) {
    const pending = await getPendingSales();
    if (!pending.length) return 0;

    let synced = 0;
    for (const sale of pending) {
        const { id, queued_at, ...payload } = sale;
        try {
            const { error } = await supabase.from('sales_log').insert([payload]);
            if (!error) {
                await deletePendingSale(id);
                synced++;
            }
        } catch (err) {
            console.warn('[Sync Error] Failed to upload queued sale:', err.message);
        }
    }
    return synced;
}

export async function insertExpenseWithOfflineSupport(supabase, payload) {
    if (!navigator.onLine) {
        const db = await openOfflineDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_EXPENSES, 'readwrite');
            tx.objectStore(STORE_EXPENSES).add({ ...payload, queued_at: Date.now() });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
        return { offline: true };
    }
    const { data, error } = await supabase.from('expenses').insert([payload]).select().single();
    if (error) throw error;
    return { data };
}

export async function syncOfflineExpenses(supabase) {
    const db = await openOfflineDB();
    const pending = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_EXPENSES, 'readonly');
        const req = tx.objectStore(STORE_EXPENSES).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });

    if (!pending.length) return 0;
    let synced = 0;
    for (const exp of pending) {
        const { id, queued_at, ...payload } = exp;
        try {
            const { error } = await supabase.from('expenses').insert([payload]);
            if (!error) {
                const tx = db.transaction(STORE_EXPENSES, 'readwrite');
                tx.objectStore(STORE_EXPENSES).delete(id);
                synced++;
            }
        } catch (err) {
            console.warn('[Sync Error] Failed to upload queued expense:', err.message);
        }
    }
    return synced;
}
```

---

### Implementation File 4: Supabase Client & Auth State Guard (`public/js/supabaseClient.js`)

```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

// REPLACE WITH CLIENT CREDENTIALS
export const supabase = createClient(
    'https://[YOUR_SUPABASE_PROJECT_REF].supabase.co',
    '[YOUR_SUPABASE_ANON_PUBLIC_KEY]'
);

export let currentUser = null;

export async function login(username, pin) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('pin', pin)
        .single();

    if (error || !data) return { success: false };
    currentUser = data;
    localStorage.setItem('pos_session', JSON.stringify(data));
    return { success: true, user: data };
}

export function logout() {
    currentUser = null;
    localStorage.removeItem('pos_session');
    window.location.href = '/login.html';
}

export function checkSession() {
    const session = localStorage.getItem('pos_session');
    if (session) {
        currentUser = JSON.parse(session);
        return true;
    }
    return false;
}

export function requireAuth() {
    if (!checkSession()) {
        window.location.href = '/login.html';
        return;
    }

    // Role-based DOM element visibility toggle
    const applyPermissions = () => {
        if (currentUser && currentUser.role === 'admin') {
            document.querySelectorAll('.admin-only').forEach((el) => el.classList.remove('hidden'));
        } else {
            document.querySelectorAll('.admin-only').forEach((el) => el.classList.add('hidden'));
        }
    };

    applyPermissions();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyPermissions);
    }
    setTimeout(applyPermissions, 100);

    // Global logout trigger
    document.addEventListener('click', (e) => {
        if (e.target.id === 'btn-logout') logout();
    });
}
```
````

---

## 4. Phase 3 Frontend & UI Prompt: Screens, Single-Screen Packaging Wizard, & Async Chain

Copy and paste the prompt below into an AI agent to build the user interface and the packaging wizard.

````markdown
# TASK: Recreate the Core UI and Single-Screen Packaging Wizard for `[INSERT_CLIENT_NAME]` (`[INSERT_INDUSTRY]`)

You are a Lead Frontend Engineer specializing in high-throughput POS interfaces. You must build the core interactive pages and specifically implement the **Single-Screen Packaging Wizard Modal** with sequential async UUID linking.

---

### Core UI Pages Required:
1. **Touch-Screen Login (`login.html` & `login.js`):**
   - User selector carousel/buttons.
   - 10-key numeric PIN pad (touch-friendly with visual feedback dots).
   - Offline fallback verification against cached users in `localStorage`.
2. **High-Speed POS Checkout Terminal (`pos.html` & `pos.js`):**
   - **Quick Add Service Grid:** High-frequency one-tap presets (e.g., standard services or common consumables) with instant payment logging (Cash vs M-Pesa).
   - **Main Product Search & Cart:** Instant debounce-free fuzzy search, quantity spinner, total price calculations, and customer assignment.
   - **Metered Hardware Tracking:** Dynamic toggle for metered units (e.g. printer page counter) computing cost-per-unit dynamically.
   - **Document Cart & PDF Engine:** Multi-line cart with one-click generation of 80mm thermal receipts and formal A4 quotations using `jsPDF` and `AutoTable`.
   - **Today's Ledger & Voiding:** Real-time transaction history with instant payment method flipping and administrative sale voiding (which triggers database stock replenishment).
   - **Online Event Listener:** Automatically invokes `syncOfflineSales()` and `syncOfflineExpenses()` when network connectivity returns.
3. **Inventory Management & Excel Export (`inventory.html` & `inventory.js`):**
   - Realtime table showing Stock Quantity, Selling Price, Buying Price, Margin, and Packaging Yield (e.g., "1 Carton = 24 pcs").
   - Low-stock indicator badges.
   - Client-side Excel export using SheetJS (`XLSX`).
   - Inline row editing.
   - **The Single-Screen Packaging Wizard Button (`#btn-add-item`).**

---

### DEEP-DIVE SPECIFICATION: The Single-Screen Packaging Wizard

The Packaging Wizard allows a business owner to create up to 4 packaging tiers for a single product line simultaneously on one modal screen without navigating away.

#### Packaging Tier Structure:
- **Tier 4 (Master Carton):** Contains multiple Tier 3 units (e.g. 4 Boxes). Top-most enabled tier (`parent_id = NULL`).
- **Tier 3 (Case / Box):** Contains multiple Tier 2 units (e.g. 5 Reams/Packs). Child of Tier 4.
- **Tier 2 (Pack / Ream):** Contains multiple Tier 1 units (e.g. 500 Pieces/Sheets). Child of Tier 3.
- **Tier 1 (Base Retail Unit):** The fundamental selling unit (e.g. Single Sheet/Pcs). Child of Tier 2.

#### The Sequential Async Insert Algorithm:
Because each tier requires the UUID primary key of its parent to establish the foreign key relationship (`parent_id`), **inserts cannot be performed in parallel (`Promise.all`)**. They must be inserted sequentially in a top-down chain:

```
[Start Wizard Submission]
          |
          v
[Collect Form Inputs: T4, T3, T2, T1]
          |
          v
[Filter Enabled Tiers in Top-Down Order: Tier 4 -> Tier 3 -> Tier 2 -> Tier 1]
          |
          v
[Initialize `lastParentId = null`]
          |
          +---> LOOP OVER ENABLED TIERS (i = 0 to tiers.length - 1):
          |        |
          |        +--> Set payload.parent_id = lastParentId
          |        |
          |        +--> Calculate payload.units_per_parent:
          |        |      If i == 0: units_per_parent = 1 (Root has no parent)
          |        |      If i > 0:  units_per_parent = tiers[i-1]._my_units
          |        |
          |        +--> AWAIT supabase.from('inventory').insert([payload]).select().single()
          |        |
          |        +--> Extract Generated Surrogate Key: `lastParentId = data.id`
          |        |
          +--------+--> Continue to next child tier in chain
          |
          v
[Close Modal, Refresh Inventory Table]
```

---

### Implementation File: Packaging Wizard Implementation (`public/js/inventory.js`)

```javascript
import { supabase, requireAuth } from './supabaseClient.js';
import { showModal } from './uiHelper.js';

requireAuth();

// Launch the Single-Screen Packaging Wizard
document.getElementById('btn-add-item').addEventListener('click', () => {
    showModal('Single-Screen Packaging Wizard', `
        <div class="space-y-4 max-h-[75vh] overflow-y-auto pr-2" id="pkg-wizard-form">
            <!-- 1. Core Info -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <h3 class="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">1. Core Product Identity</h3>
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Base Name (e.g. Premium Copy Paper)</label>
                        <input type="text" id="wiz-name" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" required placeholder="e.g. Copy Paper">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Type</label>
                        <select id="wiz-type" class="w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none">
                            <option value="fixed">Fixed Price</option>
                            <option value="variable">Variable Price</option>
                        </select>
                    </div>
                    <div class="flex items-center pt-5">
                        <input type="checkbox" id="wiz-is-service" class="mr-2 h-4 w-4 text-blue-600 rounded">
                        <label class="text-xs font-semibold text-slate-700">Is Non-Stock Service</label>
                    </div>
                </div>
            </div>

            <!-- 2. Tier 1 Base Unit -->
            <div class="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <h3 class="text-xs font-bold text-blue-800 mb-3 uppercase tracking-wider">2. Tier 1: Base Retail Unit (e.g. Single Sheet / Pcs)</h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="col-span-2 md:col-span-4">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Unit Modifier Label</label>
                        <input type="text" id="wiz-t1-mod" class="w-full border rounded-lg px-3 py-2 text-sm bg-white" placeholder="e.g. Sheet or Piece">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Cost Price</label>
                        <input type="number" id="wiz-t1-cp" class="w-full border rounded-lg px-3 py-2 text-sm bg-white" value="0" step="any">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Sell Price</label>
                        <input type="number" id="wiz-t1-sp" class="w-full border rounded-lg px-3 py-2 text-sm bg-white" value="0" step="any">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Initial Retail Stock (Pcs)</label>
                        <input type="number" id="wiz-t1-stock" class="w-full border rounded-lg px-3 py-2 text-sm bg-white font-bold text-blue-600" value="0">
                    </div>
                </div>
            </div>

            <!-- 3. Tier 2 Packet/Ream -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider">3. Tier 2: Packet / Ream</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t2-en" class="mr-2 h-4 w-4 text-blue-600 rounded" onchange="document.getElementById('t2-body').classList.toggle('hidden', !this.checked)">
                        <label class="text-xs font-bold text-blue-600 cursor-pointer" for="wiz-t2-en">Enable Tier 2</label>
                    </div>
                </div>
                <div id="t2-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Unit Modifier Label</label>
                        <input type="text" id="wiz-t2-mod" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Ream or Pack">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-blue-700 mb-1">Base Units in 1 Pack</label>
                        <input type="number" id="wiz-t2-units" class="w-full border-2 border-blue-300 rounded-lg px-3 py-2 text-sm font-bold" placeholder="e.g. 500">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Cost Price</label>
                        <input type="number" id="wiz-t2-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0" step="any">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Sell Price</label>
                        <input type="number" id="wiz-t2-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0" step="any">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Pack Stock Qty</label>
                        <input type="number" id="wiz-t2-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                </div>
            </div>

            <!-- 4. Tier 3 Box -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider">4. Tier 3: Box / Case</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t3-en" class="mr-2 h-4 w-4 text-blue-600 rounded" onchange="document.getElementById('t3-body').classList.toggle('hidden', !this.checked)">
                        <label class="text-xs font-bold text-blue-600 cursor-pointer" for="wiz-t3-en">Enable Tier 3</label>
                    </div>
                </div>
                <div id="t3-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Unit Modifier Label</label>
                        <input type="text" id="wiz-t3-mod" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Box">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-blue-700 mb-1">Packs in 1 Box</label>
                        <input type="number" id="wiz-t3-units" class="w-full border-2 border-blue-300 rounded-lg px-3 py-2 text-sm font-bold" placeholder="e.g. 5">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Cost Price</label>
                        <input type="number" id="wiz-t3-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0" step="any">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Sell Price</label>
                        <input type="number" id="wiz-t3-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0" step="any">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Box Stock Qty</label>
                        <input type="number" id="wiz-t3-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                </div>
            </div>

            <!-- 5. Tier 4 Master Carton -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xs font-bold text-slate-800 uppercase tracking-wider">5. Tier 4: Master Carton</h3>
                    <div class="flex items-center">
                        <input type="checkbox" id="wiz-t4-en" class="mr-2 h-4 w-4 text-blue-600 rounded" onchange="document.getElementById('t4-body').classList.toggle('hidden', !this.checked)">
                        <label class="text-xs font-bold text-blue-600 cursor-pointer" for="wiz-t4-en">Enable Tier 4</label>
                    </div>
                </div>
                <div id="t4-body" class="hidden grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div class="col-span-2 md:col-span-5">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Unit Modifier Label</label>
                        <input type="text" id="wiz-t4-mod" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Master Carton">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-blue-700 mb-1">Boxes in 1 Carton</label>
                        <input type="number" id="wiz-t4-units" class="w-full border-2 border-blue-300 rounded-lg px-3 py-2 text-sm font-bold" placeholder="e.g. 4">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Cost Price</label>
                        <input type="number" id="wiz-t4-cp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0" step="any">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Sell Price</label>
                        <input type="number" id="wiz-t4-sp" class="w-full border rounded-lg px-3 py-2 text-sm" value="0" step="any">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-xs font-semibold mb-1 text-slate-700">Carton Stock Qty</label>
                        <input type="number" id="wiz-t4-stock" class="w-full border rounded-lg px-3 py-2 text-sm" value="0">
                    </div>
                </div>
            </div>
        </div>
    `, async (close) => {
        const baseName = document.getElementById('wiz-name').value.trim();
        if (!baseName) {
            alert('Base Name is required.');
            return;
        }

        const type = document.getElementById('wiz-type').value;
        const isService = document.getElementById('wiz-is-service').checked;

        const formatName = (mod) => mod ? `${baseName} (${mod})` : baseName;
        const tiers = [];

        // 1. Collect Tier 4 (Master Carton) if enabled
        if (document.getElementById('wiz-t4-en').checked) {
            tiers.push({
                level: 4,
                name: formatName(document.getElementById('wiz-t4-mod').value.trim()),
                type,
                is_service: isService,
                tier_level: 4,
                buying_price: parseFloat(document.getElementById('wiz-t4-cp').value || 0),
                selling_price: parseFloat(document.getElementById('wiz-t4-sp').value || 0),
                stock_quantity: parseInt(document.getElementById('wiz-t4-stock').value || 0),
                _my_units: parseInt(document.getElementById('wiz-t4-units').value || 1)
            });
        }

        // 2. Collect Tier 3 (Box) if enabled
        if (document.getElementById('wiz-t3-en').checked) {
            tiers.push({
                level: 3,
                name: formatName(document.getElementById('wiz-t3-mod').value.trim()),
                type,
                is_service: isService,
                tier_level: 3,
                buying_price: parseFloat(document.getElementById('wiz-t3-cp').value || 0),
                selling_price: parseFloat(document.getElementById('wiz-t3-sp').value || 0),
                stock_quantity: parseInt(document.getElementById('wiz-t3-stock').value || 0),
                _my_units: parseInt(document.getElementById('wiz-t3-units').value || 1)
            });
        }

        // 3. Collect Tier 2 (Pack) if enabled
        if (document.getElementById('wiz-t2-en').checked) {
            tiers.push({
                level: 2,
                name: formatName(document.getElementById('wiz-t2-mod').value.trim()),
                type,
                is_service: isService,
                tier_level: 2,
                buying_price: parseFloat(document.getElementById('wiz-t2-cp').value || 0),
                selling_price: parseFloat(document.getElementById('wiz-t2-sp').value || 0),
                stock_quantity: parseInt(document.getElementById('wiz-t2-stock').value || 0),
                _my_units: parseInt(document.getElementById('wiz-t2-units').value || 1)
            });
        }

        // 4. Collect Tier 1 (Base Unit - Always present)
        tiers.push({
            level: 1,
            name: formatName(document.getElementById('wiz-t1-mod').value.trim()),
            type,
            is_service: isService,
            tier_level: 1,
            buying_price: parseFloat(document.getElementById('wiz-t1-cp').value || 0),
            selling_price: parseFloat(document.getElementById('wiz-t1-sp').value || 0),
            stock_quantity: parseInt(document.getElementById('wiz-t1-stock').value || 0),
            _my_units: 1
        });

        // 5. EXECUTE SEQUENTIAL ASYNC INSERTS (Top-down linking)
        let lastParentId = null;

        for (let i = 0; i < tiers.length; i++) {
            const currentTier = tiers[i];

            const payload = {
                name: currentTier.name,
                type: currentTier.type,
                is_service: currentTier.is_service,
                tier_level: currentTier.tier_level,
                buying_price: currentTier.buying_price,
                selling_price: currentTier.selling_price,
                stock_quantity: currentTier.stock_quantity,
                parent_id: lastParentId // Links to previous inserted UUID
            };

            // Set conversion ratio
            if (i > 0) {
                // Number of units of THIS SKU required to make 1 unit of previous parent
                payload.units_per_parent = tiers[i - 1]._my_units || 1;
            } else {
                payload.units_per_parent = 1; // Root package has no parent
            }

            // Await insertion into Supabase to retrieve generated UUID
            const { data, error } = await supabase
                .from('inventory')
                .insert([payload])
                .select()
                .single();

            if (error) {
                alert(`Error persisting tier ${currentTier.level}: ${error.message}`);
                return; // Halt chain on failure
            }

            // Propagate generated UUID down to next iteration as parent_id
            lastParentId = data.id;
        }

        close();
        if (typeof load === 'function') load();
    }, 'Save Packaging Hierarchy', 'max-w-4xl');
});
```

---

### Implementation File: Receipt & Quotation PDF Generator (`public/js/pos.js`)

```javascript
export function generatePDF(type = 'receipt', paymentMethod = 'Cash', docCart, customer, currentUser) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        unit: 'mm',
        format: type === 'receipt' ? [80, 200] : 'a4' // 80mm roll vs A4 sheet
    });

    const isThermal = type === 'receipt';
    let y = 10;

    // Header Branding
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? 12 : 18);
    doc.text('[INSERT_CLIENT_NAME]', isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 5 : 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isThermal ? 8 : 10);
    doc.text('Point of Sale & Services', isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 4 : 6;
    doc.text(`Date: ${new Date().toLocaleString()}`, isThermal ? 40 : 105, y, { align: 'center' });
    y += isThermal ? 6 : 10;

    // Line items table
    const tableHeaders = isThermal ? [['Item', 'Qty', 'Total']] : [['Item Description', 'Qty', 'Unit Price', 'Total']];
    const tableData = docCart.map((i) =>
        isThermal
            ? [i.name.substring(0, 18), i.qty, i.total.toFixed(2)]
            : [i.name, i.qty, i.selling_price.toFixed(2), i.total.toFixed(2)]
    );

    doc.autoTable({
        startY: y,
        head: tableHeaders,
        body: tableData,
        theme: 'plain',
        styles: { fontSize: isThermal ? 8 : 10, cellPadding: isThermal ? 1.5 : 3 },
        margin: { left: isThermal ? 5 : 15, right: isThermal ? 5 : 15 }
    });

    y = doc.lastAutoTable.finalY + 6;

    // Financial Totals
    const grandTotal = docCart.reduce((sum, item) => sum + item.total, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isThermal ? 10 : 12);
    doc.text(`TOTAL: Ksh ${grandTotal.toFixed(2)}`, isThermal ? 75 : 195, y, { align: 'right' });
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isThermal ? 8 : 10);
    doc.text(`Payment Method: ${paymentMethod}`, isThermal ? 5 : 15, y);
    doc.text(`Served by: ${currentUser?.username || 'Staff'}`, isThermal ? 5 : 15, y + 4);

    // Save PDF file
    const filename = `${type.toUpperCase()}_${customer?.name || 'Walkin'}_${Date.now()}.pdf`;
    doc.save(filename);
}
```
````
