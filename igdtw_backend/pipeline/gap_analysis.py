def calculate_segment_metrics(segment_length, light_positions, coverage_radius=25.0):
    if segment_length <= 0:
        return {'dark_fraction': 0.0, 'longest_gap_m': 0.0}
    if not light_positions:
        return {'dark_fraction': None, 'longest_gap_m': None}
        
    intervals = []
    for pos in light_positions:
        start = max(0.0, min(segment_length, pos - coverage_radius))
        end = max(0.0, min(segment_length, pos + coverage_radius))

        if end > start:
            intervals.append((start, end))
        
    intervals.sort()
    merged = []
    for start, end in intervals:
        if not merged or merged[-1][1] < start:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)

    lit_length = sum(end - start for start, end in merged)

    dark_fraction = max(0.0, (segment_length - lit_length) / segment_length)
    

    gaps = []
    current_pos = 0.0
    for start, end in merged:
        if start > current_pos:
            gaps.append(start - current_pos)
        current_pos = end
    if current_pos < segment_length:
        gaps.append(segment_length - current_pos)
        
    longest_gap = max(gaps) if gaps else 0.0
    return {'dark_fraction': dark_fraction, 'longest_gap_m': longest_gap}