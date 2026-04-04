import { ActionResult } from './types';

/**
 * Wraps a Server Action with a try/catch block to prevent uncaught 
 * exceptions (like missing state or uninitialized systems) from bubbling up 
 * to Next.js Turbopack and causing the known _formData.get TypeError bug in the UI.
 * 
 * Usage:
 * export const myAction = async (args) => withSafeAction(async () => {
 *    // ... inner logic
 *    return { success: true };
 * });
 */
export async function withSafeAction<T = any>(
    actionFn: () => Promise<ActionResult<T> | void | any>
): Promise<ActionResult<T>> {
    try {
        const result = await actionFn();
        
        // If it's already an ActionResult block, return it as is.
        if (result && typeof result === 'object' && 'success' in result) {
            return result as ActionResult<T>;
        } 
        
        // If it's raw data, wrap it in a success block.
        return { success: true, data: result as T };
    } catch (error: any) {
        console.error('[Server Action Error Caught]', error);
        return { 
            success: false, 
            error: error?.message || 'An unexpected game server error occurred.' 
        };
    }
}
