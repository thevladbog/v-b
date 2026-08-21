import type { Pool } from "pg";

export type ContactDatabasePool = Pick<Pool, "connect">;
