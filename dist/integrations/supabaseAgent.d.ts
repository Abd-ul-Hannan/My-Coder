import { AIService } from '../ai/aiService';
import { ProjectInterview } from '../types';
export interface SupabaseSchema {
    tables: SupabaseTable[];
    enums?: string[];
    functions?: string[];
}
export interface SupabaseTable {
    name: string;
    columns: Array<{
        name: string;
        type: string;
        nullable?: boolean;
        default?: string;
    }>;
    rls?: boolean;
    policies?: RLSPolicy[];
}
export interface RLSPolicy {
    name: string;
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
    using?: string;
    withCheck?: string;
}
export interface GeneratedSupabaseFiles {
    migrationSql: string;
    rlsSql: string;
    typesTs: string;
    clientTs: string;
    authHelpersTs: string;
    edgeFunctions: Array<{
        name: string;
        content: string;
    }>;
    envExample: string;
}
export declare class SupabaseAgent {
    private readonly aiService;
    constructor(aiService: AIService);
    /**
     * Generates a complete Supabase setup for a project.
     * Includes schema, RLS, types, client, auth helpers, and edge functions.
     */
    generateFullSetup(interview: ProjectInterview): Promise<GeneratedSupabaseFiles>;
    private generateSchema;
    private generateAuthHelpers;
    private generateEdgeFunctions;
    private generateTypesSafeClient;
    private fallbackMigration;
    private fallbackRLS;
    private fallbackTypes;
    private generateEnvExample;
}
//# sourceMappingURL=supabaseAgent.d.ts.map