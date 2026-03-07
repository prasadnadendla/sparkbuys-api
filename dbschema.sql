
CREATE TABLE "sb"."users" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret CHAR(32) NOT NULL,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(320),
    phone VARCHAR(13) NOT NULL,
    image VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    blocked BOOLEAN NOT NULL DEFAULT FALSE,
    comment VARCHAR(500),
    roles JSONB NOT NULL DEFAULT '["user"]'::jsonb,
    city VARCHAR(100),
    state VARCHAR(100),
    location JSONB,  -- Store lat/lng as JSON
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
    modified_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT
);

CREATE TABLE "sb"."tokens" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID NOT NULL REFERENCES sb.users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    location JSONB,  
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT,
    modified_at BIGINT NOT NULL DEFAULT extract(epoch from now())::BIGINT
);

CREATE TABLE "sb"."pushsubs" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid UUID NOT NULL UNIQUE,
    timestamp INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE "sb"."web_pushsubs" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pushsub_id UUID NOT NULL REFERENCES sb.pushsubs(id) ON DELETE CASCADE,
    endpoint VARCHAR(500) NOT NULL UNIQUE,
    keys JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expiration_time INTEGER,
    timestamp INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

CREATE TABLE "sb"."android_pushsubs" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pushsub_id UUID NOT NULL REFERENCES sb.pushsubs(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL UNIQUE,
    manufacturer VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    os VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    timestamp INTEGER NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);
-- ===========================================================

-- ===========================================================
-- OPTIONAL: ALERTS TABLE
-- ===========================================================
CREATE TABLE public.alerts (
    id SERIAL PRIMARY KEY,
    land_id INT NOT NULL REFERENCES public.lands(id) ON DELETE CASCADE,
    message TEXT,
    change_pct DOUBLE PRECISION,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW())::BIGINT)
);

CREATE INDEX idx_alerts_land_id ON public.alerts(land_id);
