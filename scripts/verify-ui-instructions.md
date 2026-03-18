
To verify the Defeat UI manually without playing a 10-hour game:

1.  **Open `app/actions/state.ts`**
2.  **Locate `getState` function.**
3.  **Force a Defeat State:**
    
    *   **For Doom Tracker (Warning):**
        Add this before the return:
        ```typescript
        myDefeatStatus = {
            status: 'ALIVE',
            doom_score: 50,
            active_defeats: [{
                condition_id: 'TEST_WARNING',
                severity: 'WARNING',
                message: 'This is a test warning.',
                status: 'ACTIVE',
                triggered_at: new Date().toISOString()
            }]
        };
        ```
    
    *   **For Game Over (Terminal):**
        ```typescript
        myDefeatStatus = {
            status: 'ELIMINATED',
            doom_score: 100,
            active_defeats: [{
                condition_id: 'HOMEWORLD_LOST',
                severity: 'TERMINAL',
                message: 'Your homeworld was conquered.',
                status: 'ACTIVE',
                triggered_at: new Date().toISOString()
            }]
        };
        ```

4.  **Save and Check Browser.**
    *   You should see the Doom Tracker with a yellow bar.
    *   OR you should see the ful-screen "DEFEAT" modal.
