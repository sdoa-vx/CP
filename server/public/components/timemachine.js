import { MeshStateStore } from '../state/meshState.js';

export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <div class="sdoa-card sdoa-col-span-12">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <div>
              <h3>TimeMachine Replay</h3>
              <p class="text-muted" style="margin-top: 0.2rem; font-size: 0.85rem;">Temporal cinematic replay of mesh state.</p>
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
              <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--sdoa-accent-primary); cursor: pointer;">
                <input type="checkbox" id="tm-ai-toggle" style="accent-color: var(--sdoa-accent-primary);">
                <span>AI Visualization</span>
              </label>
              <span id="tm-current-time" style="font-family: monospace; color: var(--sdoa-accent-primary);">Live</span>
              <button id="btn-tm-live" class="sdoa-btn sdoa-btn-outline" style="padding: 0.2rem 0.5rem;">Jump to Live</button>
            </div>
          </div>
          
          <!-- D3 Interactive Timeline -->
          <div style="margin-bottom: 2rem; position: relative; background: rgba(0,0,0,0.4); border: 1px solid var(--sdoa-border); border-radius: 8px; padding: 1rem;">
            <div id="tm-d3-canvas" style="width: 100%; height: 250px;"></div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--sdoa-text-secondary); margin-top: 0.5rem;">
              <span id="tm-start-time"></span>
              <span id="tm-end-time">Live</span>
            </div>
          </div>

          <div style="display: flex; gap: 1.5rem;">
            <!-- Event Stream Ticker -->
            <div style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--sdoa-border); border-radius: 8px; padding: 1rem; max-height: 400px; overflow-y: auto;">
              <h4 style="margin-bottom: 1rem; color: #c9d1d9;">Sovereign Event Stream</h4>
              <div id="tm-event-stream" style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem;">
                <div style="text-align: center; color: var(--sdoa-text-secondary);">Loading events...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.events = [];
    this.isReplaying = false;

    this.fetchEvents();
    
    // Poll for new events if we are Live
    this.fetchInterval = setInterval(() => {
      if (!this.isReplaying) this.fetchEvents();
    }, 3000);

    // Remove standard scrubber listeners, handled by D3 now

    document.getElementById('btn-tm-live')?.addEventListener('click', () => {
      this.jumpToLive();
    });
    
    // Handle window resize
    this.resizeHandler = () => this.renderVisuals();
    window.addEventListener('resize', this.resizeHandler);
    
    document.getElementById('tm-ai-toggle')?.addEventListener('change', () => this.renderVisuals());
  },

  destroy() {
    if (this.fetchInterval) clearInterval(this.fetchInterval);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
  },

  async fetchEvents() {
    try {
      const res = await fetch('/dashboard/api/timemachine/events');
      const data = await res.json();
      
      if (data.ok && data.events) {
        // Check if length changed to avoid expensive D3 re-renders if nothing happened
        const previousLength = this.events.length;
        const isNew = previousLength !== data.events.length;
        this.events = data.events;
        MeshStateStore.applyEvent(data.events); // dump all to store for general reference
        
        if (isNew) {
          // Trigger ripples for new live events (if not replaying)
          if (!this.isReplaying && previousLength > 0) {
            for (let i = previousLength; i < data.events.length; i++) {
               const ev = data.events[i];
               if (ev.type === "filesystem:change") {
                  MeshStateStore.triggerImpactWave(ev.data || {});
               }
            }
          }

          this.renderEventStream();
          this.updateScrubberBounds();
          this.renderVisuals();
        }
      }
    } catch (err) {
      console.error("Failed to fetch TimeMachine events", err);
    }
  },

  async renderVisuals() {
    const aiToggle = document.getElementById('tm-ai-toggle');
    if (aiToggle && aiToggle.checked) {
      try {
        const container = document.getElementById('tm-d3-canvas');
        if (container) container.innerHTML = '<div style="color: var(--sdoa-accent-primary); text-align: center; padding-top: 100px;">AI is generating timeline...</div>';

        const res = await fetch('/api/timemachine/visualize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: this.events })
        });
        
        const data = await res.json();
        
        if (data.ok && data.code) {
          // Validate the code looks like what we asked for
          if (!data.code.includes("render")) {
            throw new Error("AI did not return a valid render function signature");
          }
          
          // Dangerous eval wrapped in a safety net! (Using Function closure to sandbox scope)
          const renderFunction = new Function('containerId', 'events', 'd3', data.code + '\nreturn render(containerId, events, d3);');
          renderFunction('tm-d3-canvas', this.events, window.d3);
          return;
        } else {
          throw new Error(data.error || "AI failed to return code");
        }
      } catch (err) {
        console.warn("AI Visualization failed, falling back to local D3:", err);
        this.renderD3Timeline(); // Fallback to local
      }
    } else {
      this.renderD3Timeline(); // Local explicit
    }
  },

  renderEventStream() {
    const stream = document.getElementById('tm-event-stream');
    if (!stream) return;

    if (this.events.length === 0) {
      stream.innerHTML = `<div style="text-align: center; color: var(--sdoa-text-secondary);">No events in ledger.</div>`;
      return;
    }

    // Show latest first
    const reversed = [...this.events].reverse();
    
    stream.innerHTML = reversed.map(ev => {
      let color = '#9ca3af';
      if (ev.type.includes('violation')) color = '#ef4444';
      else if (ev.type.includes('anomaly')) color = '#f59e0b';
      else if (ev.type.includes('activated') || ev.type.includes('routed')) color = '#3b82f6';
      else if (ev.type.includes('override')) color = '#8b5cf6';
      
      return `
        <div style="padding: 0.5rem; border-left: 2px solid ${color}; background: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 0.3rem;">
          <div style="display: flex; justify-content: space-between; font-family: monospace;">
            <span style="color: ${color}; font-weight: bold;">${ev.type}</span>
            <span style="color: var(--sdoa-text-secondary);">${new Date(ev.timestamp).toLocaleTimeString()}</span>
          </div>
          <div style="color: #c9d1d9;">${ev.moduleId || ''} ${ev.sleeveId ? `→ ${ev.sleeveId}` : ''}</div>
        </div>
      `;
    }).join('');
  },

  updateScrubberBounds() {
    if (this.events.length === 0) return;
    const start = document.getElementById('tm-start-time');
    if (start) {
      start.textContent = new Date(this.events[0].timestamp).toLocaleTimeString();
    }
  },

  // We map scrub percentage (0 to 1) instead of 0 to 100 for internal use
  handleScrub(percent) {
    this.isReplaying = true;
    MeshStateStore.setReplayMode(true);
    if (this.events.length === 0) return;

    const timeDisplay = document.getElementById('tm-current-time');
    
    if (percent >= 1) {
      if (timeDisplay) timeDisplay.textContent = 'Live';
    } else {
      const idx = Math.floor(percent * (this.events.length - 1));
      const ev = this.events[idx];
      if (ev && timeDisplay) {
        timeDisplay.textContent = new Date(ev.timestamp).toLocaleTimeString();
      }
    }
  },

  async handleScrubEnd(percent) {
    if (this.events.length === 0) return;
    
    if (percent >= 1) {
      this.jumpToLive();
      return;
    }

    const idx = Math.floor(percent * (this.events.length - 1));
    const ev = this.events[idx];
    if (!ev) return;

    if (ev.type === "filesystem:change") {
      MeshStateStore.triggerImpactWave(ev.data || {});
    }

    // Fetch snapshot for this timestamp
    try {
      const res = await fetch(`/dashboard/api/timemachine/replay?at=${encodeURIComponent(ev.timestamp)}`);
      const data = await res.json();
      if (data.ok && data.state) {
        // Push state into MeshStateStore to animate the global mesh graph!
        MeshStateStore.updateFromSnapshot({
          nodes: data.state.modules.map(m => ({ id: m.id, type: 'module', radius: 15, name: m.id })).concat(
            data.state.sleeves.flatMap(s => s.versions.map(v => ({ id: v, type: 'sleeve', radius: 10, name: v.substring(0,8) })))
          ),
          links: data.state.routes.map(r => ({ source: 'Arbitration_Brain', target: r.activeSleeveId, type: 'route' }))
        }, true); // Force update during replay
      }
    } catch (err) {
      console.error("Replay fetch failed", err);
    }
  },

  jumpToLive() {
    this.isReplaying = false;
    MeshStateStore.setReplayMode(false);
    const timeDisplay = document.getElementById('tm-current-time');
    if (timeDisplay) timeDisplay.textContent = 'Live';
    
    // Snap D3 playhead back to end
    if (this.playheadG) {
       const width = document.getElementById('tm-d3-canvas').clientWidth;
       this.playheadG.attr("transform", `translate(${width},0)`);
    }

    // We don't fetch mesh state here, we just rely on the other tabs' polling 
    // or we could fetch the live mesh topology right now to snap it back.
    fetch('/dashboard/api/mesh/topology').then(r=>r.json()).then(data => {
       if (data.ok && data.topology) {
         MeshStateStore.updateFromSnapshot({ nodes: data.topology.nodes, links: data.topology.links }, true);
       }
    });
  },

  renderD3Timeline() {
    if (!window.d3) return; // Wait for D3 to load
    
    const container = document.getElementById('tm-d3-canvas');
    if (!container || this.events.length === 0) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    
    container.innerHTML = ''; // clear

    const svg = d3.select(container).append("svg")
      .attr("width", width)
      .attr("height", height);

    // Pre-process events to calculate layers and complexity
    const processedEvents = this.events.map(ev => {
      // Complexity heuristic: Payload string length / 50, clamped
      const rawSize = JSON.stringify(ev.payload || {}).length;
      const complexity = Math.max(3, Math.min(15, rawSize / 20));
      
      // Layer heuristic: Look for layer in manifest, or fallback to Layer 4
      let layer = 4;
      if (ev.payload?.layer) layer = ev.payload.layer;
      else if (ev.payload?.manifest?.layer) layer = ev.payload.manifest.layer;
      
      return { ...ev, date: new Date(ev.timestamp), complexity, layer };
    });

    // Time Scale (X Axis)
    const minTime = processedEvents[0].date;
    const maxTime = processedEvents[processedEvents.length - 1].date;
    const paddingMs = (maxTime.getTime() - minTime.getTime()) * 0.05; // 5% padding
    
    const xScale = d3.scaleTime()
      .domain([new Date(minTime.getTime() - paddingMs), new Date(maxTime.getTime() + paddingMs)])
      .range([0, width]);

    // Layer Scale (Y Axis: 1 to 7)
    // SDOA layers: 1 top, 7 bottom (or vice versa). Let's do 1 top, 7 bottom.
    const yScale = d3.scaleLinear()
      .domain([1, 7])
      .range([40, height - 40]);

    // 1. Draw Change Density Background (Area Chart)
    // Create bins for histogram
    const histogram = d3.histogram()
      .value(d => d.date)
      .domain(xScale.domain())
      .thresholds(xScale.ticks(40)); // 40 time buckets

    const bins = histogram(processedEvents);
    const yDensityScale = d3.scaleLinear()
      .domain([0, d3.max(bins, d => d.length)])
      .range([height, height / 2]); // Only take up bottom half

    const area = d3.area()
      .x(d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0))/2)
      .y0(height)
      .y1(d => yDensityScale(d.length))
      .curve(d3.curveBasis);

    svg.append("path")
      .datum(bins)
      .attr("fill", "rgba(139, 92, 246, 0.1)")
      .attr("stroke", "rgba(139, 92, 246, 0.3)")
      .attr("stroke-width", 1)
      .attr("d", area);

    // 2. Draw Layer Tracks
    for(let l=1; l<=7; l++) {
      svg.append("line")
        .attr("x1", 0)
        .attr("y1", yScale(l))
        .attr("x2", width)
        .attr("y2", yScale(l))
        .attr("stroke", "rgba(255,255,255,0.05)")
        .attr("stroke-dasharray", "4 4");
        
      svg.append("text")
        .attr("x", 5)
        .attr("y", yScale(l) - 5)
        .attr("fill", "rgba(255,255,255,0.2)")
        .attr("font-size", "10px")
        .text(`Layer ${l}`);
    }

    // 3. Draw Module Overlap/Lineage Links
    const lineGenerator = d3.line()
      .x(d => xScale(d.date))
      .y(d => yScale(d.layer))
      .curve(d3.curveMonotoneX);

    // Group events by moduleId
    const moduleGroups = d3.group(processedEvents.filter(e => e.moduleId), d => d.moduleId);
    
    moduleGroups.forEach((moduleEvents, modId) => {
      svg.append("path")
        .datum(moduleEvents)
        .attr("fill", "none")
        .attr("stroke", "rgba(16, 185, 129, 0.3)") // Emerald green for lineage
        .attr("stroke-width", 2)
        .attr("d", lineGenerator);
    });

    // 4. Draw Event Nodes
    const nodeColors = {
      "violation": "#ef4444",
      "anomaly": "#f59e0b",
      "activated": "#3b82f6",
      "override": "#8b5cf6"
    };

    svg.selectAll(".tm-node")
      .data(processedEvents)
      .enter()
      .append("circle")
      .attr("class", "tm-node")
      .attr("cx", d => xScale(d.date))
      .attr("cy", d => yScale(d.layer))
      .attr("r", d => d.complexity)
      .attr("fill", d => {
        let c = "#9ca3af";
        Object.keys(nodeColors).forEach(key => { if(d.type.includes(key)) c = nodeColors[key]; });
        return c;
      })
      .attr("opacity", 0.8)
      .attr("stroke", "#1e1e1e")
      .attr("stroke-width", 2)
      .on("mouseover", (event, d) => {
        // Tooltip logic could go here
        d3.select(event.currentTarget).attr("stroke", "#fff");
      })
      .on("mouseout", (event, d) => {
        d3.select(event.currentTarget).attr("stroke", "#1e1e1e");
      });

    // 5. The Scrubber / Playhead
    let currentX = this.isReplaying ? this.lastScrubX || width : width;
    
    const playhead = svg.append("g")
      .attr("transform", `translate(${currentX},0)`)
      .style("cursor", "ew-resize");

    playhead.append("line")
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2);

    playhead.append("polygon")
      .attr("points", "-6,0 6,0 0,8")
      .attr("fill", "#10b981");

    this.playheadG = playhead;

    const drag = d3.drag()
      .on("drag", (event) => {
        let nx = Math.max(0, Math.min(width, event.x));
        playhead.attr("transform", `translate(${nx},0)`);
        this.lastScrubX = nx;
        
        // Map pixel X back to percentage (0 to 1) for the existing scrub logic
        const percent = nx / width;
        this.handleScrub(percent);
      })
      .on("end", (event) => {
        let nx = Math.max(0, Math.min(width, event.x));
        const percent = nx / width;
        this.handleScrubEnd(percent);
      });

    playhead.call(drag);
  }
};
