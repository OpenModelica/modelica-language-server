```modelica
function velocityOfSound_ph
```
---
**Inputs**
```modelica
input SI.Pressure p "Pressure";
input SI.SpecificEnthalpy h "Specific enthalpy";
input Integer phase = 0 "2 for two-phase, 1 for one-phase, 0 if not known";
input Integer region = 0 "If 0, region is unknown, otherwise known and this input";
```

**Outputs**
```modelica
output SI.Velocity v_sound "Speed of sound";
```
