Drop real video loops here to replace a still drawing with live footage.

  assets/anim/<emotion>.webm   (or .mp4)      e.g. happy.webm, excited.webm, thinking.webm
  assets/anim/<drawing>.webm                  e.g. peaceful.webm (used by every emotion that uses that drawing)

Use a transparent WebM (VP8/VP9 with alpha) so the background shows through, roughly square, 2-4 seconds, seamless loop.
Pixie checks for these files at start-up. When an emotion has a video, the video plays (looping) instead of the still image;
lip-sync lips are only drawn on still drawings, so a video should contain its own mouth motion.

Example (from one of her drawings, with ffmpeg):
  ffmpeg -loop 1 -i assets/emotions/excited.png -t 2 -vf "scale=520:-2,zoompan=z='1+0.06*sin(on/6)':d=1:s=520x540:fps=25,format=yuva420p" -c:v libvpx -pix_fmt yuva420p -auto-alt-ref 0 assets/anim/excited.webm
