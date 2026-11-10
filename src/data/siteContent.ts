export type Memory = {
  src: string;
  alt: string;
  caption: string;
};

type SiteContent = {
  language: string;
  pageTitle: string;
  description: string;
  recipientName: string;
  senderName: string;
  theme: Record<`--${string}`, string>;
  envelope: {
    label: string;
    openLabel: string;
    hint: string;
    openingHint: string;
    liftedHint: string;
    letterLabel: string;
    sealEnabled: boolean;
    sealText: string;
    sealColor: string;
    paperColor: string;
  };
  letter: { greeting: string; paragraphs: string[]; signOff: string; closeLabel: string };
  song: { title: string; src: string; playLabel: string; pauseLabel: string; errorMessage: string };
  gallery: { heading: string; openLabel: string; closeLabel: string; dialogLabel: string; unavailableLabel: string };
  memories: Memory[];
  candle: { prompt: string; revealedWish: string; buttonLabel: string; hint: string; doneLabel: string };
  finalHeading: string;
  replayLabel: string;
  finalMessage: string;
};

// Personalize here. Asset paths are relative to public/, beginning with a slash.
export const siteContent: SiteContent = {
  language: 'en',
  pageTitle: 'A letter for you',
  description: 'A birthday letter, a few memories, and a wish for you.',
  recipientName: 'Your Name Here',
  senderName: 'From Me',
  // Optional CSS variable overrides; defaults live in styles/global.css.
  theme: {},
  envelope: {
    label: 'For you',
    openLabel: 'Open envelope',
    hint: 'Tap to open',
    openingHint: 'A little something for you',
    liftedHint: 'Tap the letter to read',
    letterLabel: 'Read your letter',
    sealEnabled: true,
    sealText: '\u2661',
    sealColor: '#cfafb1',
    paperColor: '#ffffff',
  },
  letter: {
    closeLabel: 'Back to envelope',
    greeting: 'Happy birthday, love.',
    paragraphs: [
      'This is where your first birthday message goes.',
      'Write what you admire about her and your favorite moments together.',
      'End with what you hope this new year brings her.',
    ],
    signOff: 'With all my love,',
  },
  song: {
    title: 'Our song',
    src: '', // Add /audio/our-song.mp3 only after supplying a licensed file.
    playLabel: 'Play our song',
    pauseLabel: 'Pause our song',
    errorMessage: 'The song could not be played. You can try again or keep reading.',
  },
  gallery: {
    heading: 'A few moments I love',
    openLabel: 'Enlarge photo',
    closeLabel: 'Back to letter',
    dialogLabel: 'Memory photograph',
    unavailableLabel: 'Photo unavailable',
  },
  memories: [
    {
      src: '/images/memory-1.svg',
      alt: 'Neutral landscape illustration reserved for the first photograph',
      caption: 'Replace this with a caption for your first memory.',
    },
    {
      src: '/images/memory-2.svg',
      alt: 'Neutral abstract illustration reserved for the second photograph',
      caption: 'Replace this with a caption for your second memory.',
    },
    {
      src: '/images/memory-3.svg',
      alt: 'Neutral botanical illustration reserved for the third photograph',
      caption: 'Replace this with a caption for your third memory.',
    },
  ] satisfies Memory[],
  candle: {
    prompt: 'Make a wish',
    buttonLabel: 'Blow out the candle',
    hint: 'Tap the flame',
    doneLabel: 'A wish for you',
    revealedWish: 'I hope this year gives you so many reasons to smile.',
  },
  finalMessage: 'And if you ever forget: you mean so much to me.',
  finalHeading: 'One last thing',
  replayLabel: 'Open again',
};
