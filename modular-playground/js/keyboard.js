// Note input: computer keys (Ableton layout: A = C, W = C#, ... K = C an
// octave up) and Web MIDI when the browser offers it. Monophonic with
// last-note priority: holding a key and pressing another changes the pitch
// without dropping the gate (legato); releasing it returns to the held note.

const KEY_SEMITONES = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15,
  Semicolon: 16,
};

const MIDI_C4 = 60;

const isTyping = (event) => event.target.closest?.("input, select, textarea");

export const startNoteInput = ({ noteOn, noteOff }) => {
  const held = []; // semitones, most recent last

  const press = (semitone) => {
    if (held.includes(semitone)) return;
    held.push(semitone);
    noteOn(semitone);
  };

  const release = (semitone) => {
    const index = held.indexOf(semitone);
    if (index < 0) return;
    held.splice(index, 1);
    if (held.length) noteOn(held[held.length - 1]);
    else noteOff();
  };

  window.addEventListener("keydown", (event) => {
    const semitone = KEY_SEMITONES[event.code];
    if (semitone === undefined || event.repeat || event.metaKey || event.ctrlKey || isTyping(event)) return;
    press(semitone);
  });

  window.addEventListener("keyup", (event) => {
    const semitone = KEY_SEMITONES[event.code];
    if (semitone !== undefined) release(semitone);
  });

  window.addEventListener("blur", () => {
    held.length = 0;
    noteOff();
  });

  navigator.requestMIDIAccess?.().then((access) => {
    const listen = (input) => {
      input.onmidimessage = ({ data: [status, note, velocity] }) => {
        const command = status & 0xf0;
        if (command === 0x90 && velocity > 0) press(note - MIDI_C4);
        else if (command === 0x80 || command === 0x90) release(note - MIDI_C4);
      };
    };
    access.inputs.forEach(listen);
    access.onstatechange = ({ port }) => port.type === "input" && port.state === "connected" && listen(port);
  }).catch(() => {
    // MIDI denied or unavailable: computer keys still work.
  });
};
