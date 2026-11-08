import type { RelayVideoConfig } from '../../../src/shared/relay-video-config'
/** Main-process only: never persist this object or pass it over IPC. */
export interface ModelAdapterContext { apiKey: string; baseUrl: string; model: string; referenceLimit: number; videoConfig?: RelayVideoConfig; durations?: number[]; aspectRatios?: string[]; resolutions?: string[] }
