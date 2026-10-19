import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { AvatarArt } from './components/AvatarArt'
import type { AvatarStyle } from './components/AvatarArt'
import { useAvatarGeneration } from './hooks/useAvatarGeneration'
import './App.css'

const styles: { id: AvatarStyle; name: string; description: string; tag: string }[] = [
  { id: 'blocky', name: 'Blocky 3D', description: 'Big blocks. Bigger personality.', tag: 'THE ORIGINAL' },
  { id: 'pixel', name: 'Pixel Art', description: 'A little retro. All you.', tag: 'RETRO MODE' },
  { id: 'voxel', name: 'Voxel', description: 'A whole new dimension.', tag: 'EXTRA DIMENSION' },
  { id: 'lowpoly', name: 'Low Poly', description: 'Less detail. More character.', tag: 'SHARP LOOK' },
]

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'} /></svg>
}
function Sparkle() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="M20 2v4m-2-2h4" /></svg>
}

function App() {
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>('blocky')
  const [photo, setPhoto] = useState<{ name: string; url: string; file: File } | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [resultImageError, setResultImageError] = useState(false)
  const { isLocal, connection, checkConnection, job, busy, generate, reset: resetGeneration } = useAvatarGeneration()
  const fileInput = useRef<HTMLInputElement>(null)
  const result = useRef<HTMLDivElement>(null)
  const activeStyle = styles.find((style) => style.id === selectedStyle)!

  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.url)
  }, [photo])

  function choosePhoto(file?: File) {
    if (!file || busy) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('That photo is a little big. Please choose one under 10 MB.')
      return
    }
    setError('')
    setImageReady(false)
    resetGeneration()
    setResultImageError(false)
    setPhoto({ name: file.name, url: URL.createObjectURL(file), file })
  }
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    choosePhoto(event.target.files?.[0])
    event.target.value = ''
  }
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 1) {
      setError('One character at a time. Please drop a single photo.')
      return
    }
    choosePhoto(event.dataTransfer.files[0])
  }
  function requestPreview() {
    if (!photo || !imageReady || busy) return
    setResultImageError(false)
    if (selectedStyle !== 'blocky' || connection.state !== 'ready') return
    void generate(photo.file)
    result.current?.focus({ preventScroll: true })
    if (window.matchMedia('(max-width: 760px)').matches) {
      result.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' })
    }
  }

  return (
    <>
      <a className="skip-link" href="#create">Skip to avatar creator</a>
      <header className="site-header">
        <a className="brand" href="#" aria-label="Blocky home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>blocky<span className="brand-dot">.</span></a>
        <nav aria-label="Main navigation"><a className="nav-active" href="#create">Create</a><a href="#styles">Styles</a><a href="#how-it-works">How it works</a></nav>
        <a className="header-cta" href="#create">Meet your new you <Arrow diagonal /></a>
      </header>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" /> LESS ORDINARY. MORE YOU.</p>
            <h1 id="hero-title">Real you.<br /><span>New universe.</span><span className="heading-spark" aria-hidden="true">✳</span></h1>
            <p className="hero-description">Your face, with a whole new character.<br className="desktop-break" /> Turn a photo into a game-ready kind of you.</p>
            <a className="hero-cta" href="#create">Let’s make your avatar <Arrow /></a>
            <div className="hero-note"><span className="tiny-blocks" aria-hidden="true"><i /><i /><i /></span>One photo. Your own blocky world.</div>
          </div>
          <div className="hero-art" role="img" aria-label="Illustrative Blocky 3D, Pixel Art, and Low Poly avatar styles">
            <span className="art-coordinate coord-top" aria-hidden="true">CHARACTER_SELECT / 01</span>
            <div className="art-orbit" aria-hidden="true" />
            <div className="hero-avatar side-avatar pixel-avatar"><AvatarArt variant="pixel" /><span>02 / PIXEL ART</span></div>
            <div className="hero-avatar main-avatar"><div className="avatar-label"><span className="status-dot" /> THE ORIGINAL <span>↗</span></div><AvatarArt variant="blocky" /><div className="avatar-bottom"><span>BLOCKY 3D</span><span>LVL. 01</span></div></div>
            <div className="hero-avatar side-avatar poly-avatar"><AvatarArt variant="lowpoly" /><span>04 / LOW POLY</span></div>
            <span className="floating-cross" aria-hidden="true">+</span>
            <span className="art-coordinate coord-bottom" aria-hidden="true">A LITTLE DIFFERENT LOOKS GOOD ON YOU.</span>
            <span className="art-caption">Style illustrations · not generated results</span>
          </div>
        </section>
        <section className="creator-section" id="create" aria-labelledby="creator-title">
          <div className="section-heading"><div><p className="eyebrow">THE CHARACTER LAB</p><h2 id="creator-title">Make it <span>you.</span></h2></div><p>A fresh look is just a photo away.</p></div>
          <div className="creator-grid">
            <div className="creator-controls">
              <div className="step-heading"><span className="step-number">01</span><h3>Start with a photo</h3><span className="step-hint">YOUR GOOD SIDE. ANY SIDE.</span></div>
              <input ref={fileInput} className="visually-hidden" tabIndex={-1} type="file" id="photo-upload" disabled={busy} accept="image/jpeg,image/png,image/webp" aria-label="Upload your photo" aria-describedby={error ? 'upload-error upload-help' : 'upload-help'} onChange={handleFileChange} />
              <div className={`upload-zone${isDragging ? ' is-dragging' : ''}${photo ? ' has-photo' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false) }} onDrop={handleDrop}>
                <button className="upload-button" type="button" disabled={busy} onClick={() => fileInput.current?.click()} aria-label={photo ? 'Replace your photo' : 'Choose a photo to upload'}>
                  {photo ? <img className="photo-preview" src={photo.url} alt="Your selected photo" onLoad={() => setImageReady(true)} onError={() => { setPhoto(null); setImageReady(false); setError('We couldn’t open that image. Please try another photo.') }} /> : <span className="upload-icon"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M16 21V5m-6 6 6-6 6 6M6 20v7h20v-7" /><path d="M4 11V5h5m14 0h5v6" opacity=".45" /></svg></span>}
                  <span className="upload-copy"><strong>{photo ? 'Looking good. Photo selected.' : 'Drop your photo here'}</strong><span>{photo ? 'Click to choose a different photo' : <>or <em>browse files</em> to get started</>}</span><small id="upload-help">JPG, PNG or WebP · up to 10 MB</small></span>
                </button>
                {photo && <div className="file-details"><span title={photo.name}>{photo.name}</span><button type="button" onClick={() => { setPhoto(null); setImageReady(false); resetGeneration(); setResultImageError(false); setError('') }} disabled={busy} aria-label="Remove photo">×</button></div>}
              </div>
              {error && <p className="upload-error" id="upload-error" role="alert">{error}</p>}
              <p className="privacy-note"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true"><rect x="3.5" y="7" width="9" height="7" rx="1" /><path d="M5.5 7V4a2.5 2.5 0 0 1 5 0v3" /></svg>{isLocal ? 'Your photo is processed and saved on this computer.' : 'Photos pass through our server to a private GPU. No cloud image storage.'}</p>
              <fieldset className="style-fieldset" id="styles"><legend><span className="step-number">02</span><span>Pick your universe</span></legend><div className="style-options">{styles.map((style) => <label key={style.id} className={`style-option${selectedStyle === style.id ? ' is-selected' : ''}${style.id !== 'blocky' ? ' is-coming-soon' : ''}`}><input type="radio" name="avatar-style" value={style.id} disabled={busy || style.id !== 'blocky'} checked={selectedStyle === style.id} onChange={() => { setSelectedStyle(style.id); resetGeneration(); setResultImageError(false) }} /><span className="style-thumbnail"><AvatarArt variant={style.id} /></span><span className="style-option-name">{style.name}</span>{style.id !== 'blocky' && <span className="style-soon">Soon</span>}<span className="style-check" aria-hidden="true">{selectedStyle === style.id ? '✓' : ''}</span></label>)}</div><p className="style-description">Blocky 3D with a Minecraft-style world. More styles coming soon.</p></fieldset>
              <button type="button" className="generate-button" disabled={!photo || !imageReady || busy || (connection.state !== 'ready' || selectedStyle !== 'blocky')} onClick={requestPreview}><Sparkle /><span>{busy ? 'Creating your avatar…' : job.state === 'failed' ? 'Try again' : job.state === 'succeeded' ? 'Generate another avatar' : 'Generate my avatar'}</span><Arrow /></button>
              <p className={`demo-note connection-${connection.state}`}><span className="status-dot" />{connection.state === 'checking' ? 'Connecting to the generator...' : connection.state === 'ready' ? 'Generator ready / Minecraft world' : 'Generator offline / Please try again later'}</p>
              {connection.state === 'offline' && <div className="connection-help"><p>{connection.message}</p><button type="button" onClick={() => { void checkConnection() }}>Retry connection</button></div>}
              <p className="local-generation-note">Keep this page open while generating. Download before leaving. Images are saved on the generator computer; task links expire after 24 hours.</p>
            </div>
            <div className={`result-panel${busy || job.state === 'succeeded' ? ' is-requested' : ''}`} ref={result} tabIndex={-1} aria-labelledby="result-title" aria-busy={busy}>
              <div className="result-topline">
                <h3 id="result-title">Your next profile picture</h3>
                <span className="result-badge">{job.state === 'succeeded' ? 'AVATAR READY' : busy ? 'CREATING' : job.state === 'failed' ? 'TRY AGAIN' : '1024 × 1024'}</span>
              </div>
              <div className={`result-canvas${job.state === 'succeeded' && !resultImageError ? ' has-result' : ''}`}>
                <span className="corner top-left" /><span className="corner top-right" /><span className="corner bottom-left" /><span className="corner bottom-right" />
                {job.state === 'succeeded' && job.imageUrl && !resultImageError ? (
                  <img className="generated-avatar" src={job.imageUrl} alt="Your generated Blocky avatar in a Minecraft-style world" onError={() => setResultImageError(true)} />
                ) : <>
                  <span className="canvas-cross cross-one" aria-hidden="true">+</span><span className="canvas-cross cross-two" aria-hidden="true">+</span>
                  <div className={`result-placeholder${busy ? ' is-generating' : ''}`} aria-hidden="true"><svg viewBox="0 0 120 130" fill="none"><path d="m29 29 37-13 27 16-37 13-27-16Z" fill="#303c2b" stroke="#6e8453" /><path d="M29 29v45l27 16V45L29 29Z" fill="#222b1f" stroke="#6e8453" /><path d="m56 45 37-13v45L56 90V45Z" fill="#3c4d31" stroke="#6e8453" /><path d="M29 106 7 118m86-14 20 12M56 104v23" stroke="#657b4a" strokeDasharray="3 5" /><path d="M68 57v8m13-13v8" stroke="#c3f678" strokeWidth="4" /><path d="m69 77 10-4" stroke="#c3f678" strokeWidth="2" /></svg></div>
                  <div className="result-message" role="status" aria-live="polite">
                    <h4>{resultImageError ? 'Your avatar is ready.' : job.state === 'uploading' ? 'Preparing your photo…' : job.state === 'queued' ? 'Your character is in line.' : job.state === 'running' ? 'Building your new universe…' : job.state === 'failed' ? 'Let’s try that again.' : 'Your alter ego awaits.'}</h4>
                    <p>{resultImageError ? 'The preview could not load. Please retry while the generator is connected.' : job.state === 'uploading' ? 'Sending your photo securely to the generator.' : job.state === 'queued' ? `Waiting for the GPU${job.position ? ` · queue position ${job.position}` : ''}.` : job.state === 'running' ? job.step && job.steps ? `Rendering · step ${job.step} of ${job.steps}` : 'Loading the model and creating your avatar. The first run can take longer.' : job.state === 'failed' ? job.error : 'Upload a photo to meet your Blocky character in a Minecraft-style world.'}</p>
                    {resultImageError && <button className="retry-preview" type="button" onClick={() => setResultImageError(false)}>Retry preview</button>}
                    {job.state === 'running' && job.step !== undefined && job.steps && <progress className="generation-progress" value={job.step} max={job.steps} aria-label="Sampling progress" />}
                    {busy && job.elapsedSeconds !== undefined && <span className="generation-elapsed">{job.elapsedSeconds}s elapsed</span>}
                  </div>
                  <span className="canvas-label">YOUR OWN BLOCKY WORLD</span>
                </>}
              </div>
              <div className="result-footer"><span><span className="status-dot" /> {activeStyle.name}</span><span>{job.state === 'succeeded' ? 'MINECRAFT WORLD' : isLocal ? 'LOCAL GENERATION' : 'AI GENERATED'} <span aria-hidden="true">↗</span></span></div>
              {job.state === 'succeeded' && job.imageUrl && <a className="download-button" href={`${job.imageUrl}?download=1`} download="blocky-minecraft-avatar.png">Download your avatar <Arrow /></a>}
              <span className="visually-hidden" role="status" aria-live="polite">{job.state === 'succeeded' ? 'Your avatar is ready. You can now download it.' : ''}</span>
            </div>
          </div>
        </section>
        <section className="how-section" id="how-it-works" aria-labelledby="how-title"><div className="how-intro"><p className="eyebrow">NO CHARACTER CREATOR SKILLS REQUIRED</p><h2 id="how-title">New look.<br />Same main character.</h2><p>From camera roll to character select.</p></div><ol className="how-steps"><li><span>01 / UPLOAD</span><h3>Bring your face.</h3><p>A clear, well-lit portrait works best. Just you, front and center.</p></li><li><span>02 / CHOOSE</span><h3>Find your world.</h3><p>Start with Blocky 3D and a Minecraft-style world. More styles are on the way.</p></li><li><span>03 / CREATE</span><h3>Meet your character.</h3><p>Our GPU creates your avatar. Preview it here, then download your PNG.</p></li></ol></section>
      </main>
      <footer className="site-footer"><a className="brand footer-brand" href="#">blocky<span className="brand-dot">.</span></a><p>A little blocky. A lot of personality.</p><span>MADE FOR YOUR NEXT UNIVERSE <span aria-hidden="true">✳</span></span></footer>
    </>
  )
}
export default App
