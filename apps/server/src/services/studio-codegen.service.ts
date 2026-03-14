import { RuntimeCodegenService } from '@paddie-studio/runtime';
import { StudioCodegenResult, StudioFlowDocument } from '../types/studio.types';

export class StudioCodegenService {
  private static instance: StudioCodegenService;
  private runtime: RuntimeCodegenService;

  private constructor() {
    this.runtime = RuntimeCodegenService.getInstance();
  }

  static getInstance(): StudioCodegenService {
    if (!StudioCodegenService.instance) {
      StudioCodegenService.instance = new StudioCodegenService();
    }
    return StudioCodegenService.instance;
  }

  generate(
    flow: StudioFlowDocument,
    language: 'javascript' | 'python',
    webhookUrl: string
  ): StudioCodegenResult {
    return this.runtime.generate(flow as any, language, webhookUrl) as StudioCodegenResult;
  }
}
