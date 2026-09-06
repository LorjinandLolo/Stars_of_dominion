# Music

Drop audio files into one of the three folders. That is the whole job.

```
public/music/
  ambient/    plays by default — cruising, building, reading the papers
  suspense/   an enemy fleet is at your border, you are lying in wait, you were just ambushed
  battle/     one of your fleets is fighting, or the tactical battle screen is open
```

Formats: `.mp3` `.ogg` `.oga` `.wav` `.m4a` `.aac` `.flac` `.webm` `.opus` (whatever the player's browser can decode — mp3 and ogg are the safe pair).

The game lists the folders through `/api/music`, so there is no manifest to edit and no rebuild: press **rescan** in the music control (top bar, note icon) or wait for the two-minute refresh, and the new file joins the rotation.

## How the player behaves

- Picks a random track from the current mood, never the same one twice in a row when it has a choice, and moves to another random track from the same folder when one ends.
- Mood changes crossfade over three seconds. Escalation (ambient → suspense → battle) is immediate; de-escalation waits — battle holds for twenty seconds after the last shot, suspense for thirty seconds after the threat leaves — so the music does not flap while fleets jitter at a border.
- A mood with no files falls back to `ambient`. No files anywhere: the player stays silent and the control says so.
- Volume and mute are remembered per browser (localStorage). Browsers refuse to autoplay audio before the first click or key press; the player starts on that first gesture.

## Naming

The title shown in the control is the file name with its extension, leading track numbers and `_`/`-` separators stripped: `03_cold-orbit.mp3` displays as **cold orbit**.

## Git

Files here are tracked like any other asset so a self-hosted deploy ships the soundtrack. Keep them reasonable in size (a few MB each); if the folder grows large, move the originals out and keep encoded copies here.
