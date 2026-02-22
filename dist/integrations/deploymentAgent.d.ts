import { AIService } from '../ai/aiService';
import { DevelopmentPlan, ProjectInterview } from '../types';
export interface DeploymentFiles {
    files: Array<{
        path: string;
        content: string;
    }>;
    instructions: string;
}
export declare class DeploymentAgent {
    private readonly aiService;
    constructor(aiService: AIService);
    /**
     * Generates all deployment configuration files for the selected target.
     */
    generateDeploymentConfig(interview: ProjectInterview, plan: DevelopmentPlan): Promise<DeploymentFiles>;
    private generateVercel;
    private generateDocker;
    private generateRailway;
    private generateFly;
    private generateAWS;
    private generateGenericCI;
    private githubActionsCI;
}
//# sourceMappingURL=deploymentAgent.d.ts.map