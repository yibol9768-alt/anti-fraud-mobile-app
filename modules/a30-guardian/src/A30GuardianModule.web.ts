import { NativeModule, registerWebModule } from 'expo';

import type {
  A30GuardianModuleEvents,
  GuardianBootstrapState,
  GuardianImageRecord,
  GuardianPermissionState,
  GuardianSmsRecord,
  StartMediaScanOptions,
  StartSmsScanOptions,
} from './A30Guardian.types';

class A30GuardianModule extends NativeModule<A30GuardianModuleEvents> {
  async getBootstrapStateAsync(): Promise<GuardianBootstrapState> {
    return {
      canAutoMonitor: false,
      permissionState: {
        smsGranted: false,
        mediaGranted: false,
        notificationsGranted: false,
        batteryOptimizationIgnored: false,
      },
      smsSupported: false,
      mediaSupported: false,
      nativeWatcherSupported: false,
    };
  }

  async requestGuardianPermissionsAsync(): Promise<GuardianPermissionState> {
    return {
      smsGranted: false,
      mediaGranted: false,
      notificationsGranted: false,
      batteryOptimizationIgnored: false,
    };
  }

  async getRecentSmsAsync(_options?: StartSmsScanOptions): Promise<GuardianSmsRecord[]> {
    return [];
  }

  async startSmsScanAsync(_options?: StartSmsScanOptions): Promise<GuardianSmsRecord[]> {
    this.emit('onScanProgress', {
      progress: {
        stage: 'completed',
        source: 'sms',
        scanned: 0,
        total: 0,
        cursor: undefined,
        message: 'Web 环境不支持短信扫描',
      },
    });
    return [];
  }

  async startMediaScanAsync(_options?: StartMediaScanOptions): Promise<GuardianImageRecord[]> {
    this.emit('onScanProgress', {
      progress: {
        stage: 'completed',
        source: 'media',
        scanned: 0,
        total: 0,
        cursor: undefined,
        message: 'Web 环境不支持系统图库扫描',
      },
    });
    return [];
  }

  async startGuardianMonitoringAsync(): Promise<boolean> {
    return false;
  }

  async stopGuardianMonitoringAsync(): Promise<boolean> {
    return false;
  }

  async isGuardianMonitoringActiveAsync(): Promise<boolean> {
    return false;
  }
}

export default registerWebModule(A30GuardianModule, 'A30Guardian');
