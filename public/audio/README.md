# Optional Audio

Place an audio file you own or have permission to publish here, for example
`our-song.mp3`. Set `song.src` in `src/data/siteContent.ts` to
`/audio/our-song.mp3` and edit `song.title`.

Leave the source empty if no track is available. No song is bundled. With an
empty source, both the audio element and play control are omitted. With a
configured source, playback starts only from the play button, never automatically.
The control shows a quiet error if playback fails. Replay pauses the song and
rewinds it to the beginning.
