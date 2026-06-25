import { useEffect } from 'preact/hooks';
import { MsgType } from '../../lib/messaging';

export function useMessage(
  type: MsgType | string,
  handler: (data: any) => void,
) {
  useEffect(() => {
    const listener = (message: { type: string; [key: string]: any }) => {
      if (message.type === type) {
        const { type: _t, ...data } = message;
        handler(data);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [type]);
}
