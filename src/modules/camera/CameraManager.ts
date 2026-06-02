import { Platform } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { CameraDevice, getAllCameraDevices } from 'react-native-vision-camera';

const CAMERA_PERMISSION = Platform.OS === 'ios'
  ? PERMISSIONS.IOS.CAMERA
  : PERMISSIONS.ANDROID.CAMERA;

class CameraManager {
  private static instance: CameraManager;

  private constructor() {}

  public static getInstance(): CameraManager {
    if (!CameraManager.instance) {
      CameraManager.instance = new CameraManager();
    }
    return CameraManager.instance;
  }

  public async hasPermission(): Promise<boolean> {
    try {
      const status = await check(CAMERA_PERMISSION);
      return status === RESULTS.GRANTED;
    } catch (error) {
      console.warn('Error checking camera permission:', error);
      return false;
    }
  }

  public async requestPermission(): Promise<boolean> {
    try {
      const status = await request(CAMERA_PERMISSION);
      return status === RESULTS.GRANTED;
    } catch (error) {
      console.warn('Error requesting camera permission:', error);
      return false;
    }
  }

  public getFrontCamera(): CameraDevice | undefined {
    try {
      const devices = getAllCameraDevices();
      return devices.find((device: CameraDevice) => device.position === 'front');
    } catch (error) {
      console.warn('Error retrieving camera devices:', error);
      return undefined;
    }
  }
}

export const cameraManager = CameraManager.getInstance();
