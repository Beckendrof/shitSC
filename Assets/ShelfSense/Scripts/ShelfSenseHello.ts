/**
 * Zero-input sanity script for Spectacles bring-up.
 *
 * Drop this as a Script Component on any SceneObject (for example the existing
 * `Camera Object`). It has no @input fields, so it cannot crash from missing
 * Inspector wiring or missing permissions. When the lens runs on device, open
 * Lens Studio's Logger and confirm you see:
 *
 *   [ShelfSenseHello] alive t=<seconds>
 *
 * If you do NOT see that line, the lens is not loading scripts at all
 * (script not attached, TypeScript disabled, or wrong device target).
 *
 * Once this proves the lens is alive, remove or disable this script and wire
 * the real `ShelfSenseAgent` per `shelvesense-lens/SETUP.md`.
 */
@component
export class ShelfSenseHello extends BaseScriptComponent {
  onAwake(): void {
    print(`[ShelfSenseHello] alive t=${getTime().toFixed(2)}`);

    const updateEvent = this.createEvent('UpdateEvent');
    let ticks = 0;
    updateEvent.bind(() => {
      ticks++;
      if (ticks % 120 === 0) {
        print(`[ShelfSenseHello] heartbeat ticks=${ticks} t=${getTime().toFixed(2)}`);
      }
    });
  }
}
