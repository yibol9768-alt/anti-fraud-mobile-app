import { NativeModule, requireNativeModule } from 'expo';

import type {
  A30GuardianModuleEvents,
  GuardianBootstrapState,
  GuardianImageRecord,
  GuardianPermissionState,
  GuardianSmsRecord,
  StartMediaScanOptions,
  StartSmsScanOptions,
} from './A30Guardian.types';

declare class A30GuardianModule extends NativeModule<A30GuardianModuleEvents> {
  getBootstrapStateAsync(): Promise<GuardianBootstrapState>;
  requestGuardianPermissionsAsync(): Promise<GuardianPermissionState>;
  getRecentSmsAsync(options?: StartSmsScanOptions): Promise<GuardianSmsRecord[]>;
  startSmsScanAsync(options?: StartSmsScanOptions): Promise<GuardianSmsRecord[]>;
  startMediaScanAsync(options?: StartMediaScanOptions): Promise<GuardianImageRecord[]>;
  startGuardianMonitoringAsync(): Promise<boolean>;
  stopGuardianMonitoringAsync(): Promise<boolean>;
  isGuardianMonitoringActiveAsync(): Promise<boolean>;
}

export default requireNativeModule<A30GuardianModule>('A30Guardian');
