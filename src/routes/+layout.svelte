<script>
  import '../app.css';
  let { children } = $props();
</script>

<div class="min-h-dvh bg-ink">
  <!-- pt-safe: no iPhone instalado, o app vai até embaixo do notch -->
  <div class="mx-auto max-w-2xl px-4 pb-16" style="padding-top: max(1rem, env(safe-area-inset-top))">
    {@render children()}
  </div>
</div>
