# CS452/652 Railway Control Showcase

An interactive portfolio site for a completed University of Waterloo CS452/652
real-time railway-control project.

**Live showcase:** https://y68wu.github.io/cs452-railway-control-showcase/

## Highlights

- an original responsive project narrative;
- an interactive two-train Track B control desk;
- labeled D1–D8 destinations with exact arrival stops;
- same-direction, head-on, route-block, reroute, and remove behavior;
- an embedded recording of the physical two-train demo;
- a Track B schematic and graph facts based on the public course topology data;
- architecture and implementation notes from the completed control system.

## Run locally

The site is buildless:

```sh
python3 -m http.server 4173 -d dist
```

Then open `http://localhost:4173`.

## Interactive simulator

Type `help` in the control desk to see every command, meaning, and example. The
simulator accepts:

```text
help [command|destinations]
scenario <free|follow|opposing>
dispatch <14|15> <A-F|CURRENT> <1..120> <D1-D8>
go
pause
speed <14|15> <0..120>
trips
reroute <14|15> <1..120> <D1-D8>
cancel <14|15>
remove <14|15>
sw <153|154|155|156> <S|C>
status
trackview
block <LEFT-INNER|RIGHT-INNER|MAIN-CIRCUIT|INTERLOCK>
unblock <segment>
blocks
reset
```

The animation uses three Track B route cycles—left inner, right inner, and a
main circuit combining the right outer and left inner arcs—with sensor order
and loop distances derived from the public course data. D1–D8 are anchored to
labeled sensor positions and share the same data used by the map and stopping
logic.

## Track B data

Public course track materials:
https://student.cs.uwaterloo.ca/~cs452/S26/track/

## License

Website code and original visual design are available under the MIT License.
The demo video is included as part of this project showcase.
